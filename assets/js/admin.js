// 管理画面（詳細設計 A01〜A05）
// 鍵・トークン・台帳はメモリ上だけに持つ（タブを閉じたら消える：仕様書 7.2）。
import { SITE_URL, PATH_SITE, PATH_LEDGER, pathInvite, DEVICE_KEY, KDF_ITER, PASSPHRASE_MIN } from "./config.js";
import {
  b64urlEncode, b64urlDecode, newInviteId, newSecret, newShelfId, newPin, normalizePassphrase,
  deriveKey, newSalt, readKdf, encryptJSON, decryptJSON, encryptText, decryptText, sealInvite,
  WrongKeyError, FormatError,
} from "./crypto.js";
import { getRepo, getFile, putFile, saveJSON, GitHubError } from "./github.js";
import { esc, jpDate, wday, todayStr, safeUrl, isMapUrl, extractUrl, BTYPES, bottleCard, renderInvite, TEXT, SIGN, SIGN_DEFAULT, signOf } from "./render.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 文言（基本設計 8章）
const MSG = {
  conflict: "保存できませんでした。画面を読み込み直してから、もう一度お試しください。",
  auth: "この端末の登録が切れています。サイトを作った人に連絡してください。",
  network: "インターネットにつながっているか確かめて、もう一度お試しください。",
  wrongPass: "合言葉が違います。もう一度どうぞ。",
  noStorage: "この端末では設定を保存できません。サイトを作った人に連絡してください。",
};

function errorText(e) {
  if (e instanceof GitHubError) return MSG[e.kind] || MSG.conflict;
  console.error(e);
  return MSG.conflict;
}

// ---------------------------------------------------------------- 状態（メモリのみ）
const S = {
  key: null, token: null,
  ledger: null, ledgerSalt: null, ledgerIter: KDF_ITER,
  site: { v: 1, sign: SIGN_DEFAULT, shelf: [] },
  editId: null,      // 修正中の案内の id
  pending: null,     // 作成中の案内 { id, secret }（台帳の保存に失敗したときに同じリンクでやり直すため）
  lastMade: null,    // 完成表示中の案内
  previewFrom: null, // プレビューから戻る先
};

// ---------------------------------------------------------------- 端末の設定（localStorage）
function readDevice() {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 && d.salt && d.iv && d.ct ? d : null;
  } catch {
    return null;
  }
}

function writeDevice(d) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  if (localStorage.getItem(DEVICE_KEY) === null) throw new Error("storage");
}

// ---------------------------------------------------------------- 画面の切り替え
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => { s.hidden = s.id !== `s-${name}`; });
  window.scrollTo({ top: 0 });
}

function go(name) {
  if (name === "admin") renderAdmin();
  if (name === "create") prepCreate();
  if (name === "shelf") renderShelf();
  show(name);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go]");
  if (!t) return;
  if (t.dataset.go === "create") S.editId = null;
  go(t.dataset.go);
});

function busy(btn, on, label) {
  btn.disabled = on;
  if (label) btn.textContent = label;
}

// ---------------------------------------------------------------- 日時
function nowIso() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-";
  return `${todayStr(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

const linkFor = (g) => `${SITE_URL}#${g.id}.${g.secret}`;

// ---------------------------------------------------------------- 台帳・site.json の保存
/** 台帳を「最新を読んで mutate して保存」する。保存後の台帳を S.ledger に入れる */
async function saveLedger(mutate) {
  let plain = null;
  await saveJSON(S.token, PATH_LEDGER, async (env) => {
    if (!env) throw new GitHubError("auth", 404);
    let cur;
    try {
      cur = await decryptJSON(S.key, env);
    } catch (e) {
      if (e instanceof WrongKeyError || e instanceof FormatError) throw new GitHubError("auth", 0); // 台帳が作り直された
      throw e;
    }
    plain = mutate({ invites: Array.isArray(cur.invites) ? cur.invites : [] });
    return encryptJSON(S.key, plain, S.ledgerSalt, S.ledgerIter);
  }, "update ledger");
  S.ledger = plain;
}

/** site.json を保存する。mutate が null を返したら保存しない */
async function saveSite(mutate) {
  const r = await saveJSON(S.token, PATH_SITE, (cur) => {
    const base = cur && typeof cur === "object" ? cur : { v: 1, sign: SIGN_DEFAULT, shelf: [] };
    const next = mutate({ ...base, shelf: Array.isArray(base.shelf) ? base.shelf : [] });
    return next === null ? null : { ...next, updatedAt: nowIso() };
  }, "update site");
  if (r.data) S.site = r.data;
  return r.saved;
}

async function loadAll() {
  const [led, site] = await Promise.all([getFile(S.token, PATH_LEDGER), getFile(S.token, PATH_SITE)]);
  if (!led) throw new GitHubError("auth", 404);
  const kdf = readKdf(led.data);
  if (b64urlEncode(kdf.salt) !== b64urlEncode(S.ledgerSalt)) throw new GitHubError("auth", 0); // 台帳が作り直された
  try {
    S.ledger = await decryptJSON(S.key, led.data);
  } catch {
    throw new GitHubError("auth", 0);
  }
  if (!Array.isArray(S.ledger.invites)) S.ledger.invites = [];
  S.site = site ? site.data : { v: 1, sign: SIGN_DEFAULT, shelf: [] };
  if (!Array.isArray(S.site.shelf)) S.site.shelf = [];
}

// ================================================================ A01 端末の設定
$("setupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("su-msg"), btn = $("su-btn");
  const pw = normalizePassphrase($("su-pw").value), pw2 = normalizePassphrase($("su-pw2").value);
  const token = $("su-token").value.trim();
  msg.classList.remove("wait");
  if (!pw || !pw2 || !token) { msg.textContent = "すべての欄を入力してください。"; return; }
  if (pw !== pw2) { msg.textContent = "合言葉が一致しません。"; return; }

  busy(btn, true);
  const say = (t, wait = true) => { msg.textContent = t; msg.classList.toggle("wait", wait); };
  try {
    say("確かめています…");
    let repo;
    try {
      repo = await getRepo(token);
    } catch (err) {
      if (err instanceof GitHubError && err.kind === "auth") { say("トークンが使えません。発行し直してください。", false); return; }
      throw err;
    }
    if (repo.permissions && repo.permissions.push === false) { say("トークンに書き込みの権限がありません。", false); return; }

    let key, salt, iter;
    for (let attempt = 0; attempt < 2; attempt++) {
      const led = await getFile(token, PATH_LEDGER);
      if (led) {
        // 台帳がある：合言葉を確かめる（端末登録）
        say("台帳を開いています…");
        ({ salt, iter } = readKdf(led.data));
        key = await deriveKey(pw, salt, iter);
        try {
          await decryptJSON(key, led.data);
        } catch (err) {
          if (err instanceof WrongKeyError) { say(MSG.wrongPass, false); return; }
          throw err;
        }
        break;
      }
      // 台帳がない：合言葉を登録して台帳を作る（初めての設定）
      if ([...pw].length < PASSPHRASE_MIN) { say(`合言葉は${PASSPHRASE_MIN}文字以上にしてください。`, false); return; }
      say("台帳を作っています…");
      salt = newSalt(); iter = KDF_ITER;
      key = await deriveKey(pw, salt, iter);
      try {
        await putFile(token, PATH_LEDGER, await encryptJSON(key, { invites: [] }, salt, iter), undefined, "create ledger");
        break;
      } catch (err) {
        // ほかの端末が先に台帳を作った：台帳があるものとしてやり直す
        if (err instanceof GitHubError && err.kind === "conflict" && attempt === 0) continue;
        throw err;
      }
    }

    // 端末に保存する（最後に行う）
    const box = await encryptText(key, token);
    try {
      writeDevice({ v: 1, salt: b64urlEncode(salt), iter, iv: box.iv, ct: box.ct });
    } catch {
      say(MSG.noStorage, false); return;
    }
    S.key = key; S.token = token; S.ledgerSalt = salt; S.ledgerIter = iter;
    await loadAll();
    $("setupForm").reset();
    say("", false);
    go("admin");
  } catch (err) {
    say(errorText(err), false);
  } finally {
    busy(btn, false);
  }
});

// ================================================================ A02 ログイン
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("loginErr"), btn = $("loginBtn"), pwEl = $("pw");
  const pw = normalizePassphrase(pwEl.value);
  err.classList.remove("wait");
  if (!pw) { err.textContent = "合言葉を入力してください。"; return; }
  const dev = readDevice();
  if (!dev) { go("setup"); return; }

  busy(btn, true);
  err.textContent = "台帳を開いています…"; err.classList.add("wait");
  try {
    const salt = b64urlDecode(dev.salt), iter = dev.iter || KDF_ITER;
    const key = await deriveKey(pw, salt, iter);
    let token;
    try {
      token = await decryptText(key, dev);
    } catch {
      err.textContent = MSG.wrongPass; err.classList.remove("wait");
      pwEl.value = ""; pwEl.focus();
      return;
    }
    S.key = key; S.token = token; S.ledgerSalt = salt; S.ledgerIter = iter;
    await loadAll();
    pwEl.value = ""; err.textContent = ""; err.classList.remove("wait");
    $("resetupBox").hidden = true;
    go("admin");
  } catch (e2) {
    err.classList.remove("wait");
    err.textContent = errorText(e2);
    if (e2 instanceof GitHubError && e2.kind === "auth") $("resetupBox").hidden = false; // 開発者向けの導線（D-13）
    S.key = null; S.token = null;
  } finally {
    busy(btn, false);
  }
});

$("resetup").addEventListener("click", () => {
  $("su-msg").textContent = "";
  go("setup");
});

// ================================================================ A03 台帳・看板（ネオン）
const hasUpcoming = () => S.ledger.invites.some((g) => g.date >= todayStr());
const hasToday = () => S.ledger.invites.some((g) => g.date === todayStr());

const SIGN_STATE = {
  open: "点灯中：看板は「本日開業」。リンクを持つお客様は案内状を開けます",
  reserved: "点灯中：看板は「本日貸切」。リンクを持つお客様は案内状を開けます",
  closed: "消灯中：看板は「本日休業」。ノックしても返事はありません",
};
$("signSelect").innerHTML = Object.entries(SIGN).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");

function renderNeon() {
  const sg = signOf(S.site);
  $("neonMini").classList.toggle("off", !SIGN[sg].neon);
  $("signSelect").value = sg;
  $("neonState").textContent = SIGN_STATE[sg];
  // 気づきのための一言（自動では切り替えない：基本設計 D-27）
  const note = sg === "closed" && hasToday() ? "今日の案内があります。「休業」のあいだは、お客様は案内状を開けません"
    : sg === "reserved" && !hasUpcoming() ? "今日以降の案内はありません" : "";
  $("neonNote").textContent = note;
  $("neonNote").hidden = !note;
}

function status(g, today) {
  return g.date === today ? "today" : (g.date > today ? "up" : "past");
}

function rowHTML(g, today) {
  const st = status(g, today);
  const label = { today: "本日", up: "予定", past: "ご来店済み" }[st];
  const sub = [g.size ? `${esc(g.size)}名` : "", g.time ? `${esc(g.time)}頃集合` : ""].filter(Boolean).join(" ・ ");
  return `<li class="${st === "past" ? "is-past" : ""}" data-id="${esc(g.id)}">`
    + `<div><div class="date">${esc(jpDate(g.date))}（${esc(wday(g.date))}）</div>`
    + `<div class="who">${esc(g.name)}${esc(TEXT.suffix)}${sub ? `<small>${sub}</small>` : ""}</div>`
    + `<div class="meta">暗証番号 <b>${esc(g.pin)}</b></div></div>`
    + `<span class="pill ${st}">${label}</span>`
    + `<div class="acts">`
    + `<button type="button" class="btn small" data-act="open">案内を見る</button>`
    + `<button type="button" class="btn ghost small" data-act="edit">修正する</button>`
    + `<button type="button" class="btn ghost small" data-act="try">お客様の流れで試す</button>`
    + `<button type="button" class="btn ghost small" data-act="copy">リンクをコピー</button>`
    + `</div><div class="copy-fallback" hidden></div></li>`;
}

function renderAdmin() {
  renderNeon();
  const today = todayStr();
  const byDateTime = (a, b) => (a.date === b.date ? String(a.time || "").localeCompare(String(b.time || "")) : a.date < b.date ? -1 : 1);
  const all = S.ledger.invites;
  const up = all.filter((g) => status(g, today) !== "past").sort(byDateTime);
  const past = all.filter((g) => status(g, today) === "past").sort((a, b) => -byDateTime(a, b));
  let h = `<div class="section-label">これから</div><ul class="ledger">`
    + (up.length ? up.map((g) => rowHTML(g, today)).join("") : `<li class="empty">予定はありません。</li>`) + `</ul>`;
  if (past.length) h += `<div class="section-label">これまで</div><ul class="ledger">${past.map((g) => rowHTML(g, today)).join("")}</ul>`;
  $("ledger").innerHTML = h;
}

const findInvite = (id) => S.ledger.invites.find((g) => g.id === id);

/** リンクをコピー。使えなければ、選択した入力欄を出して「コピーしてください」 */
async function copyLink(text, btn, fallbackBox) {
  const label = btn.textContent;
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    btn.textContent = "コピーしました";
    setTimeout(() => { btn.textContent = label; }, 1500);
  } catch {
    fallbackBox.innerHTML = `<input class="field" type="text" readonly value="${esc(text)}"><div class="hint-text">コピーしてください</div>`;
    fallbackBox.hidden = false;
    const input = fallbackBox.querySelector("input");
    input.focus(); input.select(); input.setSelectionRange(0, text.length);
  }
}

$("ledger").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const li = b.closest("li[data-id]");
  const g = findInvite(li.dataset.id);
  if (!g) return;
  const act = b.dataset.act;
  if (act === "open") openPreview(g, "admin");
  if (act === "edit") { S.editId = g.id; go("create"); }
  if (act === "try") window.open(linkFor(g), "_blank", "noopener");
  if (act === "copy") copyLink(linkFor(g), b, li.querySelector(".copy-fallback"));
});

$("signSelect").addEventListener("change", async () => {
  const sel = $("signSelect"), errEl = $("neonErr");
  const before = S.site, want = sel.value;
  if (!Object.hasOwn(SIGN, want)) return;
  errEl.textContent = "";
  S.site = { ...S.site, sign: want };
  renderNeon();
  $("neonState").textContent += "（保存中…）";
  sel.disabled = true;
  try {
    // 古い形の neon は消して、sign だけにする
    await saveSite((cur) => {
      const { neon, ...rest } = cur;
      return { ...rest, sign: want };
    });
  } catch (err) {
    S.site = before;
    errEl.textContent = errorText(err);
  } finally {
    sel.disabled = false;
    renderNeon();
  }
});

// ================================================================ プレビュー（G03 と同じ描画）
function openPreview(g, from) {
  S.previewFrom = from;
  renderInvite($("invite"), g, S.site.shelf);
  show("guest");
}

$("guestBack").addEventListener("click", () => {
  if (S.previewFrom === "create") show("create"); // 入力内容を残したまま戻る
  else go("admin");
});

// ================================================================ A04 案内作成・修正
const FIELDS = { date: "f-date", time: "f-time", close: "f-close", name: "f-name", size: "f-size", spot: "f-spot", map: "f-map", drink: "f-drink", msg: "f-msg", pin: "f-pin" };
const DEFAULTS = { date: "", time: "19:00", close: "23:00", name: "", size: "", spot: "", map: "", drink: "", msg: "", first: true };

/** 新しい案内の集合場所・地図の URL は、いちばん最近に保存した案内から引き継ぐ（台帳は暗号化されているので場所は公開されない） */
function lastPlace() {
  const stamp = (g) => String(g.updatedAt || g.createdAt || "");
  const g = S.ledger.invites.filter((x) => x.spot).sort((a, b) => (stamp(a) < stamp(b) ? 1 : -1))[0];
  return g ? { spot: g.spot, map: g.map || "" } : {};
}

function fillForm(obj) {
  for (const [k, id] of Object.entries(FIELDS)) $(id).value = obj[k] ?? "";
  $("f-first").checked = obj.first !== false;
}

function prepCreate() {
  const g = S.editId ? findInvite(S.editId) : null;
  $("createForm").hidden = false;
  $("made").hidden = true; $("madeCopyFallback").hidden = true;
  $("createErr").textContent = ""; $("pinWarn").textContent = "";
  S.pending = null; S.lastMade = null;
  if (g) {
    fillForm(g);
    $("cEyebrow").textContent = "Edit invitation";
    $("cTitle").textContent = `${g.name}${TEXT.suffix}の案内を修正`;
    $("submitBtn").textContent = "修正を保存";
  } else {
    S.editId = null;
    fillForm({ ...DEFAULTS, ...lastPlace(), pin: newPin() });
    $("cEyebrow").textContent = "New invitation";
    $("cTitle").textContent = "案内状をしたためる";
    $("submitBtn").textContent = "案内状を作成";
  }
}

function checkPinWarn() {
  const g = S.editId ? findInvite(S.editId) : null;
  $("pinWarn").textContent = g && $("f-pin").value.trim() !== g.pin ? "暗証番号が変わります。保存後、お客様に新しい番号を伝えてください。" : "";
}
$("f-pin").addEventListener("input", checkPinWarn);
$("rePin").addEventListener("click", () => { $("f-pin").value = newPin(); checkPinWarn(); });

/** フォームを読む。誤りがあれば { error } */
function readForm() {
  const v = (id) => $(id).value.trim();
  const sizeRaw = v("f-size");
  const data = {
    date: v("f-date"), time: v("f-time"), close: v("f-close"), name: v("f-name"),
    size: sizeRaw === "" ? "" : Number(sizeRaw),
    spot: v("f-spot"), map: extractUrl(v("f-map")), drink: v("f-drink"), msg: $("f-msg").value.replace(/\s+$/, ""), first: $("f-first").checked,
  };
  const pin = v("f-pin");
  let error = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) error = "日付を入力してください。";
  else if (!data.name) error = "グループ名を入力してください。";
  else if (data.map && !isMapUrl(data.map)) error = "地図のURLは、Google マップの「共有」でコピーしたものを貼り付けてください。";
  else if (sizeRaw !== "" && !(Number.isInteger(data.size) && data.size >= 1)) error = "人数は1以上の数字で入力してください。";
  else if (!/^[0-9]{4}$/.test(pin)) error = "暗証番号は4桁の数字で入力してください。";
  return { error, data, pin };
}

$("previewBtn").addEventListener("click", () => {
  const r = readForm();
  // 見え方の確認には日付とグループ名だけあればよい（暗証番号・人数の誤りは保存時に知らせる）
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data.date)) { $("createErr").textContent = "日付を入力してください。"; return; }
  if (!r.data.name) { $("createErr").textContent = "グループ名を入力してください。"; return; }
  $("createErr").textContent = "";
  openPreview(r.data, "create");
});

$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("createErr"), btn = $("submitBtn");
  const r = readForm();
  if (r.error) { errEl.textContent = r.error; errEl.classList.remove("wait"); return; }
  const { data, pin } = r;
  const editing = S.editId ? findInvite(S.editId) : null;
  const label = btn.textContent;
  busy(btn, true);
  errEl.textContent = "保存しています…"; errEl.classList.add("wait");
  try {
    let id, secret, createdAt;
    if (editing) {
      ({ id, secret, createdAt } = editing);
    } else {
      if (!S.pending) S.pending = { id: newInviteId(), secret: newSecret(), createdAt: nowIso() };
      ({ id, secret, createdAt } = S.pending);
    }
    // 1. 案内状（新しい salt・iv で暗号化）
    const env = await sealInvite(data, secret, pin);
    await saveJSON(S.token, pathInvite(id), () => env, editing ? "update invite" : "add invite");
    // 2. 台帳
    const row = { id, secret, pin, ...data, createdAt, updatedAt: nowIso() };
    await saveLedger((led) => ({ invites: [...led.invites.filter((g) => g.id !== id), row] }));
    const pinChanged = editing && editing.pin !== pin;
    S.lastMade = row; S.pending = null;
    errEl.textContent = ""; errEl.classList.remove("wait");
    $("pinWarn").textContent = "";
    $("madeMsg").textContent = editing
      ? (pinChanged
        ? "修正を保存しました。暗証番号が変わったので、お客様に新しい番号を伝えてください。リンクはそのままです。"
        : "修正を保存しました。リンクも暗証番号もそのままなので、お客様への連絡は不要です。")
      : "案内状を作成しました。リンクと暗証番号は、できれば別々に伝えてください。";
    $("madeSub").textContent = editing ? "反映まで1分ほどかかります。" : "作ってから見られるまで、1分ほどかかります。";
    $("madeLink").textContent = linkFor(row);
    $("madePin").textContent = row.pin;
    $("madeCopyFallback").hidden = true;
    // 入力欄は隠し、完成表示だけを見せる（暗証番号が画面に1つだけになるように。テストで判明した取り違え対策）
    $("createForm").hidden = true;
    $("made").hidden = false;
    if (editing) $("cTitle").textContent = `${row.name}${TEXT.suffix}の案内を修正`;
    window.scrollTo({ top: 0 });
  } catch (err) {
    errEl.classList.remove("wait");
    errEl.textContent = errorText(err);
  } finally {
    busy(btn, false, label);
  }
});

$("copyBtn").addEventListener("click", () => {
  if (S.lastMade) copyLink(linkFor(S.lastMade), $("copyBtn"), $("madeCopyFallback"));
});
$("tryBtn").addEventListener("click", () => {
  if (S.lastMade) window.open(linkFor(S.lastMade), "_blank", "noopener");
});

// ================================================================ A05 棚
$("b-type").innerHTML = Object.entries(BTYPES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("");

function renderShelf() {
  const shelf = S.site.shelf || [];
  $("shelfList").innerHTML = shelf.length
    ? shelf.map((b) => bottleCard(b, true)).join("")
    : `<p style="color:var(--cream-dim);margin:0">いまは棚に空きがありません。下のフォームから、置いてほしいお酒を加えてください。</p>`;
}

$("shelfList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del]");
  if (!b) return;
  const id = b.dataset.del;
  $("shelfListErr").textContent = "";
  b.disabled = true;
  try {
    await saveSite((cur) => (cur.shelf.some((x) => x.id === id) ? { ...cur, shelf: cur.shelf.filter((x) => x.id !== id) } : null));
    renderShelf();
  } catch (err) {
    b.disabled = false;
    $("shelfListErr").textContent = errorText(err);
  }
});

$("shelfForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("shelfErr"), btn = $("shelfBtn");
  const name = $("b-name").value.trim(), url = $("b-url").value.trim();
  if (!name) { errEl.textContent = "銘柄名を入力してください。"; return; }
  if (url && !safeUrl(url)) { errEl.textContent = "URLは https:// から始まる形で貼り付けてください。"; return; }
  const item = { id: newShelfId(), name, type: $("b-type").value, note: $("b-note").value.trim(), url };
  busy(btn, true);
  errEl.textContent = "保存しています…"; errEl.classList.add("wait");
  try {
    await saveSite((cur) => ({ ...cur, shelf: [...cur.shelf, item] }));
    $("b-name").value = ""; $("b-note").value = ""; $("b-url").value = "";
    errEl.textContent = "";
    renderShelf();
  } catch (err) {
    errEl.textContent = errorText(err);
  } finally {
    errEl.classList.remove("wait");
    busy(btn, false);
  }
});

// ================================================================ 起動（A01／A02 の分岐）
show(readDevice() ? "login" : "setup");
