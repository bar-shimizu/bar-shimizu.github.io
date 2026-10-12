// crypto.js のテスト内容。ブラウザ（tests/crypto.test.html）と Node（tests/run-node.mjs）の両方から使う。
import {
  randomBytes, b64urlEncode, b64urlDecode, newInviteId, newSecret, newShelfId, newPin,
  normalizePassphrase, deriveKey, newSalt, encryptJSON, decryptJSON, encryptText, decryptText,
  sealInvite, openInvite, readKdf, WrongKeyError, FormatError,
} from "../assets/js/crypto.js";
import { KDF_ITER } from "../assets/js/config.js";

const FAST = 1000; // 速く回すテスト用のくり返し回数（本番は 600,000）

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
async function rejects(promise, Err, msg) {
  try { await promise; } catch (e) { assert(e instanceof Err, `${msg}: ${e.name} が出た（期待：${Err.name}）`); return; }
  throw new Error(`${msg}: 例外が出なかった`);
}

const INVITE = {
  date: "2026-11-07", time: "19:00", close: "23:00", name: "高橋", size: 3,
  spot: "最寄りのコンビニ（〇〇店）前", drink: "ホットバタードラム",
  msg: "朝晩冷え込むようになりましたね。\n温かい一杯を🍸", first: true,
};

export const cases = [
  ["base64url：往復で元に戻り、+ / = を含まない", async () => {
    for (let n = 0; n <= 40; n++) {
      const b = randomBytes(n), s = b64urlEncode(b);
      assert(!/[+/=]/.test(s), `n=${n} に使えない文字`);
      const back = b64urlDecode(s);
      assert(back.length === n && back.every((x, i) => x === b[i]), `n=${n} で戻らない`);
    }
  }],
  ["base64url：不正な文字は FormatError", async () => {
    let ok = false;
    try { b64urlDecode("ab+/"); } catch (e) { ok = e instanceof FormatError; }
    assert(ok, "FormatError にならない");
  }],
  ["ID の長さ：案内状の番号12文字・シークレット22文字・棚の id 10文字", async () => {
    for (let i = 0; i < 50; i++) {
      assert(/^[A-Za-z0-9_-]{12}$/.test(newInviteId()), "案内状の番号");
      assert(/^[A-Za-z0-9_-]{22}$/.test(newSecret()), "シークレット");
      assert(/^b_[A-Za-z0-9_-]{8}$/.test(newShelfId()), "棚の id");
    }
  }],
  ["暗証番号：4桁の数字で、0〜9999 にかたよりなく出る", async () => {
    const N = 40000, bins = new Array(10).fill(0);
    const seen = new Set();
    for (let i = 0; i < N; i++) {
      const p = newPin();
      assert(/^[0-9]{4}$/.test(p), `形が違う: ${p}`);
      bins[Number(p[0])]++; seen.add(p);
    }
    // 先頭の数字ごとの出現数（期待 4000）。カイ二乗（自由度9）が 30 未満ならよし（偶然で超えるのは 0.1% 未満）
    const chi = bins.reduce((s, c) => s + (c - N / 10) ** 2 / (N / 10), 0);
    assert(chi < 30, `かたよりが大きい（χ²=${chi.toFixed(1)}）`);
    assert(seen.size > 9000, `種類が少なすぎる（${seen.size}）`);
  }],
  ["合言葉の正規化：全角英数字・全角空白をそろえ、前後の空白を除く", async () => {
    assert(normalizePassphrase("  ＡＢＣ　１２３ ") === "ABC 123", "NFKC と trim");
    assert(normalizePassphrase("くじら と ほたる") === "くじら と ほたる", "かなはそのまま");
    assert(normalizePassphrase("ｸｼﾞﾗ") === "クジラ", "半角カナは全角に");
  }],
  ["暗号化→復号で元に戻る（日本語・改行・絵文字を含む）", async () => {
    const salt = newSalt(), key = await deriveKey("合言葉のテスト", salt, FAST);
    const env = await encryptJSON(key, INVITE, salt, FAST);
    const back = await decryptJSON(key, env);
    assert(JSON.stringify(back) === JSON.stringify(INVITE), "中身が違う");
  }],
  ["暗号化ファイルの形：v=1・PBKDF2-SHA256・salt 16バイト・iv 12バイト", async () => {
    const salt = newSalt(), key = await deriveKey("x", salt, FAST);
    const env = await encryptJSON(key, { a: 1 }, salt, FAST);
    assert(env.v === 1 && env.kdf.alg === "PBKDF2-SHA256" && env.kdf.iter === FAST, "kdf 欄");
    assert(b64urlDecode(env.kdf.salt).length === 16, "salt の長さ");
    assert(b64urlDecode(env.iv).length === 12, "iv の長さ");
    assert(!JSON.stringify(env).includes("a\":1"), "平文が入っている");
  }],
  ["同じ鍵・同じ中身でも、暗号化のたびに iv と暗号文が変わる", async () => {
    const salt = newSalt(), key = await deriveKey("x", salt, FAST);
    const a = await encryptJSON(key, INVITE, salt, FAST), b = await encryptJSON(key, INVITE, salt, FAST);
    assert(a.iv !== b.iv && a.ct !== b.ct, "変わっていない");
  }],
  ["違う合言葉では復号できない（WrongKeyError）", async () => {
    const salt = newSalt();
    const env = await encryptJSON(await deriveKey("正しい合言葉", salt, FAST), INVITE, salt, FAST);
    await rejects(decryptJSON(await deriveKey("違う合言葉", salt, FAST), env), WrongKeyError, "違う合言葉");
  }],
  ["暗号文を1文字でも書き換えると復号できない（WrongKeyError）", async () => {
    const salt = newSalt(), key = await deriveKey("x", salt, FAST);
    const env = await encryptJSON(key, INVITE, salt, FAST);
    const c = env.ct[5] === "A" ? "B" : "A";
    await rejects(decryptJSON(key, { ...env, ct: env.ct.slice(0, 5) + c + env.ct.slice(6) }), WrongKeyError, "改ざん");
  }],
  ["形が壊れた暗号化ファイルは FormatError", async () => {
    const key = await deriveKey("x", newSalt(), FAST);
    await rejects(decryptJSON(key, { v: 2 }), FormatError, "v が違う");
    await rejects(decryptJSON(key, null), FormatError, "null");
    await rejects(decryptJSON(key, { v: 1, kdf: { alg: "PBKDF2-SHA256", iter: 1e9, salt: "AA" }, iv: "AA", ct: "AA" }), FormatError, "回数が大きすぎる");
  }],
  ["文字列（トークン）の暗号化→復号、違う鍵では WrongKeyError", async () => {
    const salt = newSalt();
    const key = await deriveKey("合言葉", salt, FAST), other = await deriveKey("ちがう", salt, FAST);
    const box = await encryptText(key, "github_pat_EXAMPLE_not_a_real_token");
    assert(await decryptText(key, box) === "github_pat_EXAMPLE_not_a_real_token", "戻らない");
    await rejects(decryptText(other, box), WrongKeyError, "違う鍵");
  }],
  [`案内状：本番と同じ回数（${KDF_ITER.toLocaleString()}回）で、正しい暗証番号なら開き、違えば開かない`, async () => {
    const secret = newSecret(), pin = "0721";
    const env = await sealInvite(INVITE, secret, pin);
    assert(readKdf(env).iter === KDF_ITER, "回数が本番と違う");
    const back = await openInvite(env, secret, pin);
    assert(back.name === "高橋" && back.msg === INVITE.msg, "中身が違う");
    await rejects(openInvite(env, secret, "0722"), WrongKeyError, "別の暗証番号");
    await rejects(openInvite(env, newSecret(), pin), WrongKeyError, "別のシークレット（リンクの改変）");
  }],
  ["案内状：保存のたびに salt と iv が変わる（修正で作り直される）", async () => {
    const secret = newSecret();
    const a = await sealInvite(INVITE, secret, "1234", FAST), b = await sealInvite(INVITE, secret, "1234", FAST);
    assert(a.kdf.salt !== b.kdf.salt && a.iv !== b.iv, "変わっていない");
    assert((await openInvite(b, secret, "1234")).name === "高橋", "開けない");
  }],
  ["案内状：暗証番号を変えて保存し直すと、前の番号では開かない", async () => {
    const secret = newSecret();
    const env = await sealInvite(INVITE, secret, "5555", FAST);
    await rejects(openInvite(env, secret, "1111"), WrongKeyError, "前の番号");
    assert((await openInvite(env, secret, "5555")).name === "高橋", "新しい番号で開けない");
  }],
];

/** すべて実行して、結果を report(name, ok, ms, errorMessage) で知らせる。失敗数を返す */
export async function runAll(report) {
  let failed = 0;
  for (const [name, fn] of cases) {
    const t = performance.now();
    try { await fn(); report(name, true, performance.now() - t); }
    catch (e) { failed++; report(name, false, performance.now() - t, e && e.message); }
  }
  return failed;
}
