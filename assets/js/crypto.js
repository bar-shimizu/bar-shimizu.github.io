// 暗号の部品（基本設計書 4章）。ブラウザ標準の Web Crypto API だけを使う。
// 乱数はすべて crypto.getRandomValues。DOM には触らない（Node でもテストできる）。
import { KDF_ITER } from "./config.js";

const KDF_ALG = "PBKDF2-SHA256";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** 鍵が違う（暗証番号・合言葉の間違い、または改ざん）ときの例外 */
export class WrongKeyError extends Error {
  constructor() { super("wrong key"); this.name = "WrongKeyError"; }
}
/** 暗号化ファイルの形が壊れているときの例外 */
export class FormatError extends Error {
  constructor(msg) { super(msg || "bad format"); this.name = "FormatError"; }
}

// ---------------------------------------------------------------- 乱数・base64url
export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str)) throw new FormatError("bad base64url");
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 案内状の番号：ランダム9バイト → 12文字 */
export const newInviteId = () => b64urlEncode(randomBytes(9));
/** リンクのシークレット：ランダム16バイト → 22文字 */
export const newSecret = () => b64urlEncode(randomBytes(16));
/** 棚の瓶の id：b_ ＋ ランダム6バイト（8文字） */
export const newShelfId = () => "b_" + b64urlEncode(randomBytes(6));

/** 暗証番号：0000〜9999 を一様に（棄却法で偏りをなくす） */
export function newPin() {
  const LIMIT = 4294960000; // 10000 × floor(2^32 / 10000)
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < LIMIT) return String(buf[0] % 10000).padStart(4, "0");
  }
}

/** 合言葉の正規化：全角・半角のゆれをそろえ（NFKC）、前後の空白を除く（基本設計 D-5） */
export function normalizePassphrase(str) {
  return String(str ?? "").normalize("NFKC").trim();
}

// ---------------------------------------------------------------- 鍵
/** 材料（文字列）と salt から AES-256-GCM の鍵を作る（PBKDF2-SHA256） */
export async function deriveKey(material, saltBytes, iter = KDF_ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(material), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export const newSalt = () => randomBytes(SALT_BYTES);

/** 暗号化ファイルの kdf 欄から salt と回数を取り出す */
export function readKdf(envelope) {
  checkEnvelope(envelope);
  return { salt: b64urlDecode(envelope.kdf.salt), iter: envelope.kdf.iter };
}

// ---------------------------------------------------------------- 暗号化・復号
/** オブジェクトを JSON にして暗号化し、暗号化ファイルの形で返す。iv は毎回新しく作る */
export async function encryptJSON(key, obj, saltBytes, iter = KDF_ITER) {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
  return { v: 1, kdf: { alg: KDF_ALG, iter, salt: b64urlEncode(saltBytes) }, iv: b64urlEncode(iv), ct: b64urlEncode(ct) };
}

/** 暗号化ファイルを復号する。鍵が違えば WrongKeyError */
export async function decryptJSON(key, envelope) {
  checkEnvelope(envelope);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(envelope.iv) }, key, b64urlDecode(envelope.ct));
  } catch (e) {
    if (e instanceof FormatError) throw e;
    throw new WrongKeyError();
  }
  try {
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new FormatError("bad json");
  }
}

/** トークンなど文字列を暗号化する（端末の設定で使う。kdf 欄は付けない） */
export async function encryptText(key, text) {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
  return { iv: b64urlEncode(iv), ct: b64urlEncode(ct) };
}

export async function decryptText(key, { iv, ct }) {
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(iv) }, key, b64urlDecode(ct)));
  } catch (e) {
    if (e instanceof FormatError) throw e;
    throw new WrongKeyError();
  }
}

function checkEnvelope(e) {
  const ok = e && e.v === 1 && e.kdf && e.kdf.alg === KDF_ALG
    && Number.isInteger(e.kdf.iter) && e.kdf.iter > 0 && e.kdf.iter <= 10000000
    && typeof e.kdf.salt === "string" && typeof e.iv === "string" && typeof e.ct === "string";
  if (!ok) throw new FormatError("bad envelope");
}

// ---------------------------------------------------------------- 案内状（基本設計 4.2）
const inviteMaterial = (secret, pin) => `${secret}:${pin}`;

/** 案内状を暗号化する。salt・iv は毎回新しく作る（修正のたびに作り直す：仕様書 7.5） */
export async function sealInvite(data, secret, pin, iter = KDF_ITER) {
  const salt = newSalt();
  const key = await deriveKey(inviteMaterial(secret, pin), salt, iter);
  return encryptJSON(key, data, salt, iter);
}

/** 案内状を復号する。暗証番号・シークレットが違えば WrongKeyError */
export async function openInvite(envelope, secret, pin) {
  const { salt, iter } = readKdf(envelope);
  const key = await deriveKey(inviteMaterial(secret, pin), salt, iter);
  return decryptJSON(key, envelope);
}
