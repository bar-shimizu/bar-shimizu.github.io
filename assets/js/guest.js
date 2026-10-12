// お客様用ページ（詳細設計 G01 看板・G02 暗証番号・G03 案内状）
// 復号した中身は端末に保存しない（読み込み直すと看板からやり直し：仕様書 6.4）。
import { PATH_SITE, pathInvite } from "./config.js";
import { openInvite, WrongKeyError } from "./crypto.js";
import { renderInvite, SIGN, signOf } from "./render.js";

const $ = (id) => document.getElementById(id);
const HASH_RE = /^#([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{22})$/;

const state = {
  sign: "closed", // 看板：open（開業）／reserved（貸切）／closed（休業）
  shelf: [],
  secret: null,
  envelope: null, // 案内状の暗号化ファイル（取れたときだけ）
};

// ---------------------------------------------------------------- 読み込み（G01 2章）
async function fetchJSON(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function looksLikeEnvelope(e) {
  return e && e.v === 1 && e.kdf && typeof e.iv === "string" && typeof e.ct === "string";
}

async function load() {
  const m = HASH_RE.exec(location.hash);
  const sitePromise = fetchJSON(PATH_SITE).catch(() => null); // 取れなければ休業扱い
  const invitePromise = m ? fetchJSON(pathInvite(m[1])).catch(() => null) : Promise.resolve(null);
  const [site, envelope] = await Promise.all([sitePromise, invitePromise]);
  state.sign = signOf(site);
  state.shelf = site && Array.isArray(site.shelf) ? site.shelf : [];
  if (m && looksLikeEnvelope(envelope)) {
    state.secret = m[2];
    state.envelope = envelope;
  }
  applyNeon();
}

const ready = load();

// ---------------------------------------------------------------- 画面の切り替え
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => { s.hidden = s.id !== `s-${name}`; });
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- 看板（G01）
const door = $("door");
const knockEl = $("knock");
let knocks = 0;
let resetTimer = null;
let busy = false; // 3回目の後の演出中

function applyNeon() {
  const sg = SIGN[state.sign];
  $("neon").classList.toggle("off", !sg.neon);
  door.classList.toggle("dark", !sg.neon);
  $("plate").textContent = sg.plate;
  $("doorText").textContent = sg.note;
}

function setKnockText(text, long = false) {
  knockEl.textContent = text;
  knockEl.classList.toggle("long", long);
}

function resetKnocks(after) {
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { knocks = 0; setKnockText(""); busy = false; }, after);
}

async function knock() {
  if (busy) return;
  door.classList.remove("thud"); void door.offsetWidth; door.classList.add("thud");
  knocks++;
  clearTimeout(resetTimer);
  setKnockText("コン".repeat(Math.min(knocks, 3)));
  if (knocks < 3) { resetKnocks(1500); return; }

  busy = true;
  await ready; // 読み込みが終わってから判断する
  // 休業：返事はなく「コンコンコン」だけ
  if (state.sign === "closed") {
    resetKnocks(1800);
    return;
  }
  // 開業・貸切：有効なリンクがあれば暗証番号へ。無ければ「マスターまでご連絡ください。」（D-31）
  if (!state.envelope) {
    setTimeout(() => setKnockText(SIGN[state.sign].noLink, true), 500);
    resetKnocks(3000);
    return;
  }
  setTimeout(() => setKnockText("……はい。"), 500);
  setTimeout(() => { knocks = 0; setKnockText(""); busy = false; openPin(); }, 1300);
}

door.addEventListener("click", knock);
door.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); knock(); }
});

// ---------------------------------------------------------------- 暗証番号（G02）
const MISS_LINES = ["「……番号が違うようです」", "「もう一度、お確かめください」", "「お手元の案内をご覧になって」", "「マスターに直接お尋ねください」"];
const LOCK_FROM = 5;   // 5回目の失敗から
const LOCK_MS = 3000;  // 3秒入力を受け付けない（基本設計 D-14）
let entry = "";
let misses = 0;
let checking = false;
let lockedUntil = 0;

const pinErr = $("pinErr");
const pad = $("pad");

function setPinMsg(text, kind = "") {
  pinErr.textContent = text;
  pinErr.classList.toggle("wait", kind === "wait");
}

function drawDots() {
  const s = $("dots").children;
  for (let i = 0; i < 4; i++) s[i].textContent = i < entry.length ? "●" : "";
}

function setPadEnabled(on) {
  pad.querySelectorAll("button:not([data-fn='back'])").forEach((b) => { b.disabled = !on; });
}

function openPin() {
  entry = ""; misses = 0; checking = false; lockedUntil = 0;
  drawDots(); setPinMsg(""); setPadEnabled(true);
  show("pin");
}

const canType = () => !checking && Date.now() >= lockedUntil;

function press(digit) {
  if (!canType() || entry.length >= 4) return;
  entry += digit; drawDots(); setPinMsg("");
  if (entry.length === 4) setTimeout(checkPin, 250);
}

function backspace() {
  if (!canType()) return;
  entry = entry.slice(0, -1); drawDots();
}

async function checkPin() {
  if (checking || entry.length !== 4) return;
  checking = true; setPadEnabled(false);
  setPinMsg("扉の向こうで鍵を探している…", "wait");
  try {
    const data = await openInvite(state.envelope, state.secret, entry);
    if ($("s-pin").hidden) { checking = false; setPadEnabled(true); return; } // 照合中に「戻る」が押された
    setPinMsg("");
    setTimeout(() => showInvite(data), 200);
  } catch (e) {
    if (!(e instanceof WrongKeyError)) console.error(e);
    setPinMsg(MISS_LINES[Math.min(misses, MISS_LINES.length - 1)]);
    misses++;
    const d = $("dots"); d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake");
    entry = "";
    setTimeout(drawDots, 300);
    const lock = misses >= LOCK_FROM ? LOCK_MS : 0;
    lockedUntil = Date.now() + lock;
    setTimeout(() => { checking = false; setPadEnabled(true); }, lock);
  }
}

pad.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.fn === "back") { show("front"); return; }
  if (b.dataset.fn === "clear") { backspace(); return; }
  press(b.textContent.trim());
});

document.addEventListener("keydown", (e) => {
  if ($("s-pin").hidden) return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
});

// ---------------------------------------------------------------- 案内状（G03）
function showInvite(data) {
  renderInvite($("invite"), data, state.shelf);
  show("guest");
}

// リンクの # 以降が変わったら、最初から読み込み直す
window.addEventListener("hashchange", () => location.reload());
