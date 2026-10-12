// 案内状と瓶イラストの描画（お客様用・管理用で共通。詳細設計 G03）
// 値はすべて esc() してから HTML に入れる。

// ---------------------------------------------------------------- 固定の文言
// 管理者ヒアリングで変わる可能性がある文言は、ここにまとめておく
export const TEXT = {
  suffix: "御一行様",
  lead: "INVITATION",
  meetNote: "到着されたらご連絡を。お迎えにあがります。",
  sign: "― マスター",
  firstBottle: {
    intro: "Bar清水に初めてお越しになる際は、お好きなボトルをお持ちいただけます。お持ちいただいた一本は棚に並び、次の夜からは皆さまで楽しむお酒になります。",
    // ここでの「棚」は、すぐ下に並べる候補（マスターが管理画面の棚に登録したもの）。候補が無いときは出さない
    withShelf: "お持ちいただくボトルに迷われる場合は、棚をご覧ください。",
  },
  houseRules: [
    "料金を決めてお酒や料理を提供することはありません。お酒や食材の実費を負担いただきます。",
    "お酒は持参いただいたものまたは清水が購入したものをお飲みいただけます。他の人の持参酒を飲むのは、「その人の厚意によるもの」にあたるので問題ありません。",
    "ボトルは「個人間の預かり」として自宅に保管します。",
    "自宅は鉄筋コンクリートですが、共用部では静かにお願いします。",
    "喫煙される方は近くのローソン(喫煙所は午後8時まで)をご利用ください。",
    "ビールを飲まれる方は、ご自身の分をお持ちいただけると助かります。",
  ],
  closing: {
    title: "MESSAGE",
    body: "構想3年をかけて準備してきたBar清水。趣味の美味しい物巡りや飲み会企画で培った経験をすべて注ぎます。皆さんが感動と驚きを感じ、素晴らしいひと時を過ごせることを心から願っています。ご期待ください！",
    sign: "Bar清水マスター　清水翔太",
  },
  bellLines: [
    "「いらっしゃいませ」",
    "「本日も良いお酒が入っております」",
    "「お席はご用意できております」",
    "「……少々お待ちを。今シェイカーを振っております」",
  ],
};

// ---------------------------------------------------------------- 看板（G01）
// site.json の sign で切り替える。古い形（neon: true/false）も読めるようにしておく
export const SIGN = {
  // 開業・貸切は、有効なリンクがあれば暗証番号へ進める。リンクが無い人への返事は noLink（D-31）
  open: { label: "開業", plate: "本日開業", note: "ご連絡お待ちしています。", noLink: "マスターまでご連絡ください。", neon: true },
  reserved: { label: "貸切", plate: "本日貸切", note: "ご招待のお客様は、扉を三度ノックしてください。", noLink: "マスターまでご連絡ください。", neon: true },
  closed: { label: "休業", plate: "本日休業", note: "清水の都合で休業となります。また別日にお越しください。", neon: false },
};
export const SIGN_DEFAULT = "closed";

export function signOf(site) {
  if (!site || typeof site !== "object") return SIGN_DEFAULT;
  if (Object.hasOwn(SIGN, site.sign)) return site.sign;
  return site.neon === true ? "reserved" : SIGN_DEFAULT;
}

// ---------------------------------------------------------------- 小道具
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** "2026-11-07" → "2026年11月7日" */
export function jpDate(d) {
  const p = String(d).split("-");
  return `${p[0]}年${+p[1]}月${+p[2]}日`;
}

/** "2026-11-07" → "土" */
export function wday(d) {
  return ["日", "月", "火", "水", "木", "金", "土"][new Date(`${d}T00:00:00`).getDay()];
}

/** 端末のローカル日付（YYYY-MM-DD） */
export function todayStr(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const safeUrl = (u) => /^https?:\/\//i.test(u || "");

/** Google マップのリンクだけを通す（集合場所のリンク） */
export function isMapUrl(u) {
  let x;
  try { x = new URL(String(u || "").trim()); } catch { return false; }
  if (x.protocol !== "https:") return false;
  const h = x.hostname.toLowerCase();
  if (h === "maps.app.goo.gl" || h === "maps.google.com" || h === "maps.google.co.jp") return true;
  if (h === "goo.gl") return x.pathname.startsWith("/maps");
  return /^(www\.)?google\.(com|co\.jp)$/.test(h) && x.pathname.startsWith("/maps");
}

/** 貼り付けた文（「店名＋URL」など）から、最初の http(s) の URL だけを取り出す */
export function extractUrl(text) {
  const m = /https?:\/\/[^\s<>"'「」（）()]+/i.exec(String(text || ""));
  return m ? m[0] : String(text || "").trim();
}

// ---------------------------------------------------------------- 瓶（試作の BTYPES・PATHS）
export const BTYPES = {
  whisky: { label: "ウイスキー", en: "WHISKY", shape: "round", liq: "#b8732e" },
  gin: { label: "ジン", en: "GIN", shape: "square", liq: "#cfe3dd" },
  rum: { label: "ラム", en: "RUM", shape: "round", liq: "#7a3b1c" },
  vodka: { label: "ウォッカ", en: "VODKA", shape: "square", liq: "#dde6ea" },
  tequila: { label: "テキーラ", en: "TEQUILA", shape: "square", liq: "#d8b45a" },
  brandy: { label: "ブランデー", en: "BRANDY", shape: "round", liq: "#8f3f1f" },
  liqueur: { label: "リキュール", en: "LIQUEUR", shape: "long", liq: "#6f8f3a" },
  wine: { label: "ワイン", en: "WINE", shape: "long", liq: "#5e1a24" },
  sake: { label: "日本酒", en: "SAKE", shape: "tall", liq: "#e6dfc2" },
  shochu: { label: "焼酎", en: "SHOCHU", shape: "tall", liq: "#e0d9cb" },
};
const PATHS = {
  round: "M26 4h8v24q14 6 14 18v62q0 4-4 4h-28q-4 0-4-4v-62q0-12 14-18z",
  square: "M26 4h8v20l12 8v76q0 4-4 4h-24q-4 0-4-4v-76l12-8z",
  long: "M27 4h6v34q15 8 15 24v46q0 4-4 4h-28q-4 0-4-4v-46q0-16 15-24z",
  tall: "M27 4h6v22q14 4 15 16v66q0 4-4 4h-28q-4 0-4-4v-66q1-12 15-16z",
};
let clipN = 0;

export function bottleSVG(type) {
  const t = BTYPES[type] || BTYPES.whisky;
  const p = PATHS[t.shape];
  const id = `bc${++clipN}`;
  return `<svg viewBox="0 0 60 120" aria-hidden="true"><defs><clipPath id="${id}"><path d="${p}"/></clipPath></defs>`
    + `<path d="${p}" fill="rgba(236,223,198,.07)"/>`
    + `<g clip-path="url(#${id})"><rect x="0" y="54" width="60" height="70" fill="${t.liq}" opacity=".85"/>`
    + `<path d="M16 48v52" stroke="rgba(255,255,255,.22)" stroke-width="2.5" stroke-linecap="round"/></g>`
    + `<rect x="25" y="2" width="10" height="8" rx="1" fill="#8a6f42"/>`
    + `<rect x="15" y="66" width="30" height="26" rx="1" fill="#ecdfc6"/>`
    + `<rect x="17" y="68" width="26" height="22" fill="none" stroke="#8a6f42" stroke-width=".6"/>`
    + `<text x="30" y="81.5" text-anchor="middle" font-family="Courier Prime, Courier New, monospace" font-size="5.6" font-weight="700" fill="#2a1e19" letter-spacing=".5">${t.en}</text>`
    + `<path d="${p}" fill="none" stroke="#c8a25e" stroke-width="1.2" opacity=".7"/></svg>`;
}

/** 瓶カード。admin なら「持ち込まれた」ボタンを付ける */
export function bottleCard(b, admin = false) {
  const t = BTYPES[b.type] || BTYPES.whisky;
  return `<div class="bottle">${bottleSVG(b.type)}`
    + `<div class="bt">${esc(t.label)}</div><div class="bn">${esc(b.name)}</div>`
    + (b.note ? `<div class="bnote">${esc(b.note)}</div>` : "")
    + (safeUrl(b.url) ? `<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">商品ページを見る ↗</a>` : "")
    + (admin ? `<button type="button" class="btn ghost small" data-del="${esc(b.id)}">持ち込まれた</button>` : "")
    + `</div>`;
}

// ---------------------------------------------------------------- 案内状
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/** 案内状の HTML。空の項目は省略する（詳細設計 G03 2章） */
export function inviteHTML(g, shelf = []) {
  const facts = [`<dt>DATE</dt><dd>${esc(jpDate(g.date))}（${esc(wday(g.date))}）</dd>`];
  const meet = [has(g.time) ? `${esc(g.time)}頃 集合` : "", has(g.close) ? `${esc(g.close)}頃お開き` : ""].filter(Boolean);
  if (meet.length) facts.push(`<dt>MEET</dt><dd>${meet.join(" ／ ")}</dd>`);
  const size = Number(g.size);
  if (Number.isInteger(size) && size > 0) facts.push(`<dt>PARTY</dt><dd>${size}名さま</dd>`);

  const extras = [];
  // 集合場所：コースター（押すと裏返る）。地図の URL があれば、裏の集合場所の文言が Google マップへのリンクになる
  if (has(g.spot)) {
    const spot = isMapUrl(g.map)
      ? `<a class="v map" href="${esc(String(g.map).trim())}" target="_blank" rel="noopener noreferrer" tabindex="-1">${esc(g.spot)}</a>`
      : `<div class="v">${esc(g.spot)}</div>`;
    extras.push(`<div class="coaster">`
      + `<div class="flip">`
      + `<div class="face front" aria-hidden="true"><div class="c-ring">MEETING</div><div class="c-mark">S</div><div class="c-ring">POINT</div></div>`
      + `<div class="face back"><div class="k">MEETING POINT</div>${spot}`
      + `<div class="s">${esc(TEXT.meetNote)}</div>`
      + `</div></div><button type="button" class="tap" aria-expanded="false">コースターを裏返す</button></div>`);
  }
  // 今夜の一杯：ロックグラス（押すとお酒が注がれ、名前が出る）
  if (has(g.drink)) {
    extras.push(`<button type="button" class="glass" aria-label="グラスを手に取って今夜の一杯を見る">`
      + `<div class="glass-stage"><div class="glass-art">${rocksGlassSVG()}`
      + `<div class="glass-text"><div class="k">TONIGHT</div><div class="v">${esc(g.drink)}</div></div></div>`
      + `</div><div class="tap">グラスを手に取る</div></button>`);
  }

  const fb = TEXT.firstBottle;
  const firstBottle = g.first
    ? `<section class="shelf-wish"><div class="eyebrow">Your first bottle</div>`
      + `<p>${esc(fb.intro)}</p>`
      + (shelf && shelf.length
        ? `<p>${esc(fb.withShelf)}</p><div class="bottles">${shelf.map((b) => bottleCard(b, false)).join("")}</div>`
        : "")
      + `</section>`
    : "";
  const cl = TEXT.closing;

  return `<div class="crest">Bar清水</div>`
    + `<h1>${esc(g.name)}${esc(TEXT.suffix)}</h1>`
    + `<p class="lead lead-en">${esc(TEXT.lead)}</p>`
    + `<dl class="facts">${facts.join("")}</dl>`
    + (extras.length ? `<div class="extras${extras.length === 1 ? " single" : ""}">${extras.join("")}</div>` : "")
    + (has(g.msg) ? `<div class="letter">${esc(g.msg)}</div>` : "")
    + `<div class="sign">${esc(TEXT.sign)}</div>`
    + firstBottle
    + `<div class="rules"><div class="eyebrow">House rules</div><ol>${TEXT.houseRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></div>`
    + `<div class="rules closing"><div class="eyebrow">${esc(cl.title)}</div><p>${cl.body.split(/(?<=。)/).map(esc).join("<br>")}</p><p class="closing-sign">${esc(cl.sign)}</p></div>`
    + `<div class="bell"><button type="button" class="btn ghost bell-btn">🔔 ベルを鳴らす</button><div class="bell-msg" aria-live="polite"></div></div>`;
}

/** ロックグラス（すりガラス風。ふちの線は無く、うっすら白い面で形を見せる。D-32）。.is-open で下からお酒が満ち、その中に名前が浮かぶ */
let glassN = 0;
function rocksGlassSVG() {
  const id = `gl${++glassN}`;
  const outer = "M12 10H108L100.5 104Q99.6 114 89 114H31Q20.4 114 19.5 104Z";
  const inner = "M17.5 14H102.5L95.5 99H24.5Z"; // グラスの内側（お酒が入る部分）
  return `<svg class="rocks" viewBox="8 6 104 112" aria-hidden="true"><defs>`
    + `<clipPath id="${id}c"><path d="${inner}"/></clipPath>`
    + `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2354a"/><stop offset="1" stop-color="#5a0f22"/></linearGradient>`
    + `</defs>`
    // すりガラスの面
    + `<path d="${outer}" fill="rgba(236,223,198,.08)"/>`
    + `<g clip-path="url(#${id}c)">`
    + `<g class="liquid"><rect x="12" y="30" width="96" height="72" fill="url(#${id}g)" opacity=".85"/>`
    + `<path d="M17 30.6H103" stroke="rgba(255,190,200,.45)" stroke-width="1.2"/></g>`
    + `</g>`
    // 光の反射と、飲み口のかすかな線
    + `<path d="M23 20L28.5 92" stroke="rgba(255,255,255,.22)" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="M12 10H108" stroke="rgba(236,223,198,.3)" stroke-width="1"/>`
    + `</svg>`;
}

/** 案内状の仕掛け（コースター・ロックグラス・ベル）を動かす */
export function bindInvite(root) {
  root.querySelectorAll(".glass").forEach((el) => {
    el.addEventListener("click", () => el.classList.toggle("is-open"));
  });
  // コースターはどこを押しても裏返る。ただし裏の地図のリンクを押したときは地図を開くだけ
  root.querySelectorAll(".coaster").forEach((el) => {
    const btn = el.querySelector(".tap");
    const link = el.querySelector("a.map");
    el.addEventListener("click", (e) => {
      if (e.target.closest("a.map")) return;
      const open = el.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (link) link.tabIndex = open ? 0 : -1;
    });
  });
  const bell = root.querySelector(".bell-btn");
  const msg = root.querySelector(".bell-msg");
  let n = 0;
  if (bell) bell.addEventListener("click", () => { msg.textContent = TEXT.bellLines[n % TEXT.bellLines.length]; n++; });
}

/** 案内状を描いて仕掛けを付ける */
export function renderInvite(root, g, shelf) {
  root.innerHTML = inviteHTML(g, shelf);
  bindInvite(root);
}
