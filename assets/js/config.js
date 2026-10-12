// 定数。テスト用・本番用のどちらで動いているかは、公開URLから自動で判断する
// （同じコードをそのまま両方のリポジトリに置けるようにするため）。

export const OWNER = "bar-shimizu";
export const BRANCH = "main";

const REPO_PROD = "bar-shimizu.github.io"; // https://bar-shimizu.github.io/
const REPO_TEST = "bar-shimizu-test";      // https://bar-shimizu.github.io/bar-shimizu-test/

// サイトのいちばん上のURL（このファイルは assets/js/ にある）
export const SITE_URL = new URL("../../", import.meta.url).href;

const siteUrl = new URL(SITE_URL);
const isProd = siteUrl.hostname === "bar-shimizu.github.io" && siteUrl.pathname === "/";
// 本番以外（テスト用の公開URL、手元の確認用サーバー）はすべてテスト用リポジトリに保存する
export const REPO = isProd ? REPO_PROD : REPO_TEST;
export const IS_PROD = isProd;

// GitHub API の宛先。手元の確認（127.0.0.1）で ?mockapi=… を付けたときだけ、偽の API に向ける。
// 公開URLではこの切り替えは効かない。
const mockApi = typeof location !== "undefined" && location.hostname === "127.0.0.1"
  ? new URLSearchParams(location.search).get("mockapi") : null;
export const API_BASE = mockApi && /^http:\/\/127\.0\.0\.1:\d+$/.test(mockApi) ? mockApi : "https://api.github.com";

// 暗号
export const KDF_ITER = 600000;

// データの置き場所（リポジトリ内のパス）
export const PATH_SITE = "data/site.json";
export const PATH_LEDGER = "data/ledger.json";
export const pathInvite = (inviteId) => `data/invites/${inviteId}.json`;

// 端末に保存する設定（トークンの暗号文と台帳の salt）
// テスト用と本番は同じアドレス（bar-shimizu.github.io）の下にあり、端末の保存場所を共有するため、
// リポジトリごとに名前を分ける。
export const DEVICE_KEY = `barShimizu.device.v1:${REPO}`;

// 合言葉の最低文字数（初めての設定のとき）
export const PASSPHRASE_MIN = 12;
