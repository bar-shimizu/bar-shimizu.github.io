# Bar清水 案内状サイト

家バー「Bar清水」の案内状サイト。お客様は届いたリンクと4桁の暗証番号で、自分たちの案内状だけを開ける。管理者（マスター）はスマホの裏口ページから案内状を作る。

- サーバーは使わない。GitHub Pages で公開し、データは GitHub のリポジトリに置く。
- お客様の情報は、ブラウザの中で暗号化（PBKDF2-SHA256 600,000回 → AES-256-GCM）してから保存する。平文で置くのは `data/site.json`（看板の表示と棚）だけ。
- 合言葉・トークン・暗証番号・リンクのシークレットは、このリポジトリのどこにも平文で置かない。

この README は開発者向けの運用手順。

---

## 1. 構成

| 用途 | リポジトリ | 公開URL |
|---|---|---|
| 本番 | `bar-shimizu/bar-shimizu.github.io` | https://bar-shimizu.github.io/ |
| テスト用 | `bar-shimizu/bar-shimizu-test` | https://bar-shimizu.github.io/bar-shimizu-test/ （普段は Private で非公開。改修の検証のときだけ Public に戻す：6章） |

- お客様用：`/`（看板 → 3回ノック → 暗証番号 → 案内状）
- 管理用：`/backroom/`（どこからもリンクしない）
- コードは両方のリポジトリで同じ。どちらに保存するかは `assets/js/config.js` が公開URLから自動で判断する（本番URLのとき以外はテスト用に保存）。
- 台帳・案内状・合言葉・トークンは、テスト用と本番で別々。

```
index.html                  お客様用
backroom/index.html         管理用
backroom/manifest.webmanifest  ホーム画面に追加したとき単独のアプリとして開く設定
assets/css/style.css
assets/js/config.js         定数・テスト用／本番の判定
assets/js/crypto.js         暗号（Web Crypto API のみ）
assets/js/github.js         GitHub Contents API の読み書き
assets/js/render.js         案内状の描画。固定の文言は先頭の TEXT にまとめてある
assets/js/guest.js          お客様用ページ
assets/js/admin.js          管理用ページ
data/site.json              看板の表示・棚（平文）
data/ledger.json            台帳（合言葉の鍵で暗号化。端末の設定で作られる）
data/invites/<id>.json      案内状（リンクのシークレット＋暗証番号の鍵で暗号化）
tests/                      暗号のテスト
```

---

## 2. はじめに一度だけ（公開まで）

1. **GitHub Pages を有効にする**：リポジトリの Settings → Pages → Source「Deploy from a branch」→ Branch「main」「/ (root)」→ Save。1分ほどで公開URLが開ける。
2. **トークンを発行する**（3章）。
3. **管理者のスマホで端末の設定をする**（4章）。順番を守ること。

本番は `data/site.json` の初期状態（`"sign": "closed"`＝休業、`"shelf": []`）、台帳なしから始める。テスト用リポジトリのデータ（台帳・案内状・テスト中の site.json）は本番に入れない。

---

## 3. トークンの発行

管理者は GitHub のアカウントを持たないため、管理画面からの保存には開発者のトークンを使う。

1. https://github.com/settings/personal-access-tokens/new を開く（Fine-grained token）
2. 次のように設定する

   | 項目 | 本番用 | テスト用 |
   |---|---|---|
   | Resource owner | `bar-shimizu` | `bar-shimizu` |
   | Expiration | 1年 | 30日など短め |
   | Repository access | Only select repositories → `bar-shimizu.github.io` | Only select repositories → `bar-shimizu-test` |
   | Repository permissions | Contents：Read and write | 同左 |

3. Generate token。表示された `github_pat_…` は一度しか見られない。パスワードマネージャーに保存する。
4. 管理者の承認が必要と出たら、Organization の Settings → Personal access tokens → Pending requests で承認する。

トークンはチャット・メール・ファイルに貼らない。使うのは「この端末の設定」画面に貼るときだけ。

---

## 4. 管理者のスマホで端末の設定（iPhone）

**順番が大事。** Safari のまま設定すると、ホーム画面のアイコン側に引き継がれない。

1. 管理者のスマホの Safari で `https://bar-shimizu.github.io/backroom/` を開く
2. 共有ボタン →「ホーム画面に追加」
3. Safari を閉じ、**ホーム画面のアイコンから開き直す**
4. 「この端末の設定」画面で、合言葉（2回）とトークンを入れて「設定する」
   - 初めての設定では、ここで入れた合言葉が登録され、台帳が作られる（12文字以上。単語を3〜4個つなげた文がおすすめ）
   - 台帳がすでにある場合は、その台帳の合言葉を入れる
5. 「ご来店台帳」が開けば完了。合言葉は管理者に口頭で伝え、開発者も安全な場所に控える

本番では試しの案内状を作らない（削除機能が無く、台帳に残り続ける）。見た目の確認は「お客様の見え方で確認」で行う。

---

## 5. 困ったとき

### 端末をなくした・機種変更した
1. GitHub の Settings → Developer settings → Personal access tokens で、そのトークンを無効化（Revoke）する
2. 新しいトークンを発行する（3章）
3. 新しいスマホで端末の設定をする（4章。台帳がすでにあるので、今の合言葉を入れる）

### トークンの期限が切れた（「この端末の登録が切れています」と出る）
1. 新しいトークンを発行する（3章）
2. 管理者のスマホで裏口を開き、合言葉を入れる → 「設定をやり直す」→ 今の合言葉と新しいトークンで設定する

### 合言葉を忘れた
- 開発者の控えから伝える。
- 控えもない場合、**台帳は復元できない**。案内状そのものは、お客様のリンクと暗証番号で引き続き開ける（合言葉は案内状の暗号に使っていない）が、管理画面からは扱えなくなる。
- 台帳を作り直す手順：
  1. GitHub 上で `data/ledger.json` を削除する（リポジトリの画面でファイルを開き、削除してコミット）
  2. 管理者のスマホで、ホーム画面の裏口のアイコンを削除する（アイコンと一緒に、その端末の設定も消える。「設定をやり直す」ボタンは正しい合言葉でログインしたときにしか出ないため、この方法を使う）
  3. 4章の手順でホーム画面に追加し直し、新しい合言葉とトークンで設定する（新しい台帳が作られる）
  4. 以前の案内状は台帳に戻らない。必要なら作り直す
- アイコンを削除しても設定が残っている（ログイン画面が出る）場合は、iPhone の 設定 → アプリ → Safari → 詳細 → Webサイトデータ で `bar-shimizu.github.io` を削除してから、もう一度追加する。

### 管理画面が使えないときに、看板だけ切り替えたい
GitHub 上で `data/site.json` を開き、鉛筆アイコンで `"sign"` を `"open"`（開業）／`"reserved"`（貸切）／`"closed"`（休業）に書き換えてコミットする。1分以内に反映される。

### 保存が反映されない
保存から公開ページへの反映は、ふだん20秒ほど。短い時間に何度も保存すると、GitHub Pages の作り直しが後回しになり、数分かかることがある。リポジトリの Actions タブで「pages build and deployment」の状態を確認できる。

---

## 6. 開発（手元での確認）

```bash
python -m http.server 8765
```

- お客様用：http://127.0.0.1:8765/ 、管理用：http://127.0.0.1:8765/backroom/ （手元ではテスト用リポジトリに保存される）
- 暗号のテスト：`node tests/run-node.mjs`、またはブラウザで `tests/crypto.test.html` を開く
- 本物の GitHub を使わずに管理画面を試すとき：サイトの複製を作り、偽の GitHub API を立てて `?mockapi=http://127.0.0.1:<port>` を付けて開く（`127.0.0.1` のときだけ効く。公開URLでは効かない）
- 文言の変更：お客様に見える固定の文言は `assets/js/render.js` の `TEXT` にまとめてある

### 改修の流れ（公開後）
テスト用リポジトリは、普段は **Private**（GitHub Pages は止まり、テスト用サイトは見られない）にしておく。テスト用トークンも削除しておく。

1. 手元で直して確かめる（上の「手元での確認」。管理画面は偽の GitHub API で試す）
2. スマホの実機で確かめたいときだけ：
   - テスト用リポジトリを **Public** に戻す（Settings → General → Danger Zone → Change visibility）
   - Settings → Pages で「Deploy from a branch」「main ／ / (root)」になっているか確かめる（外れていれば選び直す）。表示まで1分ほど
   - テスト用トークンを作り直し（3章）、テスト用サイトの管理画面で「設定をやり直す」から登録し直す（**テスト用の合言葉**を入れる）
   - テスト中に実在のお客様の名前を使わない（Public の間は全履歴が誰でも見られる）
3. テスト用リポジトリに送る：`git pull --rebase test main` → コミット → `git push test main`
4. 本番に送る：`bash tools/release_prod.sh` → 中身を確かめる → `git push prod prod-release:main`
5. 終わったら、テスト用リポジトリを **Private** に戻し、テスト用トークンを**削除**する（Settings → Developer settings → Fine-grained tokens → 対象を確かめて Delete）

### 送り方
- テスト用リポジトリには管理画面からの保存（`data/`）が積み重なる。送る前に取り込む：`git pull --rebase test main`
- 本番に送るときは、テスト用のデータを含めない（2章）
