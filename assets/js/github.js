// GitHub REST API（Contents API）の読み書き（基本設計 6.6・仕様書 9章）
// 管理画面だけが使う。お客様用ページは読み込まない。
import { OWNER, REPO, BRANCH, API_BASE } from "./config.js";

const API = API_BASE;

/**
 * GitHub とのやりとりの失敗。kind は次のどれか
 *  conflict：sha の不一致（ほかの端末が先に保存した）／auth：トークンが使えない
 *  network：通信できない／other：そのほか
 */
export class GitHubError extends Error {
  constructor(kind, status, message) {
    super(message || `${kind} ${status || ""}`.trim());
    this.name = "GitHubError";
    this.kind = kind;
    this.status = status;
  }
}

function errorFor(status, method) {
  if (status === 409 || status === 422) return new GitHubError("conflict", status);
  if (status === 401 || status === 403) return new GitHubError("auth", status);
  // 書き込み先が見えない（トークンの対象外など）ときも 404 が返る
  if (status === 404 && method !== "GET") return new GitHubError("auth", status);
  return new GitHubError("other", status);
}

async function request(token, method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store", // API の応答は60秒キャッシュされることがあるため、常に最新を取る
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError("network", 0);
  }
  return res;
}

const repoUrl = () => `${API}/repos/${OWNER}/${encodeURIComponent(REPO)}`;
const contentsUrl = (path) => `${repoUrl()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

// ---------------------------------------------------------------- base64（UTF-8）
function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------- API
/** リポジトリの情報（トークンの確認用）。401/404 は auth として扱う */
export async function getRepo(token) {
  const res = await request(token, "GET", repoUrl());
  if (res.status === 404) throw new GitHubError("auth", 404);
  if (!res.ok) throw errorFor(res.status, "GET");
  return res.json();
}

/** JSON ファイルを読む。無ければ null。{ data, sha } を返す */
export async function getFile(token, path) {
  const res = await request(token, "GET", `${contentsUrl(path)}?ref=${encodeURIComponent(BRANCH)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw errorFor(res.status, "GET");
  const body = await res.json();
  let data;
  try {
    data = JSON.parse(base64ToUtf8(body.content || ""));
  } catch {
    throw new GitHubError("other", res.status, "bad json");
  }
  return { data, sha: body.sha };
}

/** JSON ファイルを書く。sha なしなら新規作成（既にあれば conflict）。新しい sha を返す */
export async function putFile(token, path, data, sha, message) {
  const res = await request(token, "PUT", contentsUrl(path), {
    message,
    content: utf8ToBase64(`${JSON.stringify(data, null, 1)}\n`),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });
  if (!res.ok) throw errorFor(res.status, "PUT");
  const body = await res.json();
  return body.content.sha;
}

/**
 * 最新を読んで、mutate で新しい内容を作り、保存する（sha の不一致なら1回だけやり直す）。
 * mutate(現在の内容 or null) は新しい内容を返す。null を返したら保存しない（変更なし）。
 * 戻り値：{ data, sha, saved }
 */
export async function saveJSON(token, path, mutate, message) {
  for (let attempt = 0; ; attempt++) {
    const cur = await getFile(token, path);
    const next = await mutate(cur ? cur.data : null);
    if (next === null) return { data: cur ? cur.data : null, sha: cur ? cur.sha : null, saved: false };
    try {
      const sha = await putFile(token, path, next, cur ? cur.sha : undefined, message);
      return { data: next, sha, saved: true };
    } catch (e) {
      if (e instanceof GitHubError && e.kind === "conflict" && attempt === 0) continue;
      throw e;
    }
  }
}
