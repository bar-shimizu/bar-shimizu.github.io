// Node でテストを実行する：node tests/run-node.mjs
// （ブラウザで tests/crypto.test.html を開いても同じテストが走る）
import { readFileSync } from "node:fs";
import { runAll } from "./crypto.cases.js";

// 乱数は crypto.getRandomValues だけを使う決まり（仕様書 5.4）
const src = readFileSync(new URL("../assets/js/crypto.js", import.meta.url), "utf8");
let failed = 0;
if (/Math\.random/.test(src)) { console.log("NG  crypto.js に Math.random が使われている"); failed++; }
else console.log("OK  crypto.js に Math.random が使われていない");

failed += await runAll((name, ok, ms, err) => {
  console.log(`${ok ? "OK" : "NG"}  ${name}  (${ms.toFixed(0)} ms)${ok ? "" : "\n    " + err}`);
});
console.log(failed ? `\n${failed} 件失敗` : "\nすべて合格");
process.exitCode = failed ? 1 : 0;
