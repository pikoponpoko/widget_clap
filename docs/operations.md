> 現在の既定デプロイはDBなしのブラウザ体験版です。以下は後続Owner版の手順で、`wrangler.owner.jsonc` を使用します。

# 運用と導入

## 構成

```
公開サイト → iframe /widget/:slug → 公開API → D1
Owner → Cloudflare Access → /admin と /api/owner/* → D1 / R2
Cron（18:00 UTC）→ 完全JSON → 非公開バックアップ専用R2
```

`wrangler.owner.jsonc` は未反映のテンプレートです。D1のIDはダミーです。Workerへのアップロード・公開、既存Workerの置き換え、リモートDB変更はユーザー確認後に行います。初期seedの作品タイトル・サイトURLも本番適用前に確認します。

## 作成済みWorkerに合わせる設定

1. 配信ドメインは `hakushu.kazukisekiguchi.com`（`routes` の Custom Domain）。`workers_dev` は無効。Worker名を `name` に設定。現行Workerのソース・ルート・環境変数・バインディングを先に確認し、既存機能がある場合は別Workerまたは検証環境を使います。
2. D1 `DB` バインディングに実データベース名とIDを設定。
3. R2 `IMAGES` と `BACKUPS` を別バケットへ接続。両方ともR2直接公開をOFFにし、画像だけWorkerの検証済み公開APIから配信します。バックアップバケットにパブリックドメインを付けません。
4. Cloudflare AccessのSelf-hostedアプリで、`hakushu.kazukisekiguchi.com` のパス `admin` と `api/owner` を保護（Workerの「Protect this Worker behind Access」は公開ウィジェットも塞ぐため使いません）。Ownerの1メールアドレスだけを許可します。公開ウィジェット・画像API・投稿API・返信確認APIはAccessの対象から外します。
5. `ENVIRONMENT=production` は設定ファイルに記載。`ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`、`ACCESS_AUDIENCE=<AccessアプリのAUD>`、`OWNER_EMAIL=<Ownerメール>` はリポジトリに残さないよう `wrangler secret put` で登録します。`LOCAL_OWNER_ENABLED` は本番で設定しません。コードはJWTのRS256署名・issuer・audience・期限・email・subを検証します。
6. Secrets：ランダムな32バイト以上の `SPAM_SECRET` と `TURNSTILE_SECRET_KEY`。環境変数 `TURNSTILE_SITE_KEY`。Turnstileの許可ホストにウィジェット配信ホスト `hakushu.kazukisekiguchi.com`（設置先サイトではない）を登録し、`message` actionを利用します。未設定の本番投稿は503で閉じます。
7. `TIP_LINKS_ENABLED=true`（2026-10-31 ユーザー承認）。投げ銭リンクはサイトごとにURLと3つの確認チェックが揃った場合のみ表示されます。本サービスは決済情報・本人確認情報を保存しません。PayPay個人間送金は使いません。
8. 実際の設置元オリジンを作品設定に登録（例 `https://kazukisekiguchi.com`）。`frame-ancestors` で許可先を制限します。`www` 等は別オリジンとして追加します。

承認後に使うコマンドの例（このタスクでは実行していません）：

```sh
npx wrangler d1 migrations apply hakushu --config wrangler.owner.jsonc --remote
# scripts/seed.sql は本番に適用しません。ページは管理画面で作成します。
npm run build:owner
npx wrangler deploy --config wrangler.owner.jsonc
```

本番は Workers Builds で `main` から自動デプロイします（Worker `creator-support-widget`）。

- Build command: `npm run build:owner`
- Deploy command: `npx wrangler d1 migrations apply hakushu --remote --config wrangler.owner.jsonc && npx wrangler deploy --config wrangler.owner.jsonc`
- Preview builds: 無効（本番のD1/R2に接続するため）
- 「wrangler.jsonc の name を creator-support-widget にする」という提案・自動PRは採用しません。`wrangler.jsonc` は体験版 `widget-clap` 用です。

各リソース名・ID・Worker名は実環境に合わせます。CloudflareアカウントのログインやAPIトークンは通常の安全な認証経路を使います。

## 投稿・画像の防御

- Cookie認証だけに依存せず、Owner APIごとにサーバーで署名済みJWTを検証。変更操作はOrigin一致必須。
- 公開投稿も同一オリジンJSONのみ。訪問者のアカウント・メールは不要。Turnstileのhostname/actionを検証。
- 感想は2000文字、返信は4000文字。ハニーポット、送信までの最小時間、送信元ごとの回数制限とリクエストID重複排除。
- 残り容量を超える感想はエラー。拍手は容量と重複抑止のためカウントしない場合あり。
- 本文はReactのテキスト描画のみ。HTML挿入なし。CSP、nosniff、no-referrer、非公開APIはno-store、CORS許可なし。
- 返信確認はフラグメントの秘密をPOSTで渡します。生トークンをDB・ログに残さず、ハッシュを保存。ブロック・削除・URL無効化後は閲覧不可。
- 画像はストリーム読み込み量・バイトシグネチャ・寸法・容量を検証。SVG拒否。元ファイル名を保存せずランダムキーでR2保存。画像専用MIMEとsandbox CSPで配信。
- 管理者の画像登録は公開素材専用です。個人用画像・秘密情報はアップロードしないでください。

## バックアップと復元

- 毎日03:00 JSTに整合したD1読取スナップショットと参照画像本体をJSONに保存。欠けた画像がある場合は成功扱いにしません。
- 完全JSONは設定・拍手・感想・返信・公開同意・画像・返信トークンハッシュを含みます。バックアップ一覧自体、監査ログ、一時的な制限値は含みません。
- UIの「完全バックアップをDL」でオフライン保存できます。「今すぐバックアップ」は非公開R2へ保存します。直近の成功日時を管理画面に表示します。
- 復元は50MB以内のファイル・型・参照・画像を検証後、新しい画像キーに保存してからD1をbatch transactionで置き換えます。DB変更失敗時はロールバックし、新規画像を除去します。成功後に旧画像を消去します。
- 大量行の復元はD1プランのクエリ数制限（1回のリクエストに対する制限）を超える可能性があります。D1 SQLの定期エクスポートとR2バックアップを別途運用します。リモートSQLのエクスポート／インポートも本番操作として承認を取ります。

```sh
# 作成されたバックアップには非公開情報を含みます。安全な保管場所へ出力します。
npx wrangler d1 export hakushu --remote --output <安全な場所>/d1-backup.sql
# 復旧用の別D1へインポートし、検証後にDBバインディングを切り替えます。
npx wrangler d1 execute <復旧先DB> --remote --file <安全な場所>/d1-backup.sql
```

D1のSQL復元は、画像を同じstorage_keyで保持するR2スナップショットと組にします。完全JSONからの大規模復旧は `scripts/prepare-recovery.mjs` でSQLと画像ファイルを生成できます。元の保存先を上書きせず、別DB・別バケットで検証後にバインディングを切り替えます。

バックアップの復旧試験では、返信確認URL・公開同意・返信内容・画像がすべて戻ることを確認します。ローカルではこの往復をE2Eで検証します。実クラウドでの復旧演習は未実施です。

## 削除

個別削除と感想全件削除は返信とURLも削除します。既存バックアップ内のコピーは7日保持される場合があります。データ削除依頼を受けたらOwnerが対象を確認し、削除とURL失効を行い、バックアップ保持期間を案内します。

「バックアップを含む全データを削除」は画像・全バックアップのオブジェクトを削除してからDBを消去します。外部決済サービス側のデータは対象外です。大量データではメンテナンス時間帯に投稿受付とCronを止めてから実行し、完了後にR2/D1が空であることを確認します。途中で失敗した場合は部分削除の可能性があるため、処理を再実行して完了を確認します。

## 公開前の手動確認

- Owner以外・未認証で管理APIへアクセスできないこと（実Cloudflare Access）。
- 本番Turnstileの投稿・失敗・期限切れと、WAF・Workersログ設定。
- 各ツールページとテーマA/B/C、スマホ、Safari/iOS、キーボード操作。
- 日本語長文PDFを100%印刷し、91×55mmの実測・余白と位置補正を確認。
- バックアップの自動実行と失敗監視、復旧・削除演習、R2費用・容量。
- 投げ銭は条件確認が済むまでUI非表示。

## 大規模復旧のファイル準備

```sh
node scripts/prepare-recovery.mjs <完全バックアップ.json> <新しい空の出力ディレクトリ>
```

このスクリプトはネットワークへ書き込まず、`data.sql`、`images/` と `images.json` を生成します。出力には非公開情報を含みます。復旧用の新D1にマイグレーション適用後、`data.sql` を読み込みます。`images.json` のkey・file・mimeを使い、復旧用の新R2へ画像を登録します。実行は事前承認後です。

```sh
npx wrangler r2 object put <復旧用バケット>/<key> --file <file> --content-type <mime> --remote
```

復旧用Workerへ接続して感想・返信URL・画像を検証してから、DB/R2バインディングの切り替えを承認・実行します。元のDB/バケットを上書きしません。
