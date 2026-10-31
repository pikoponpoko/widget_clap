# Hakushu

任意のWebページに小さな画像ボタンを置ける、React + TypeScript製のウィジェットです。[統合仕様との照合・実装計画](docs/spec-reconciliation.md) と [当初の開発計画書](docs/creator_support_widget_plan_v2.md) を参照してください。

**[埋め込みデモを開く](https://widget-clap.pikoponpoko.workers.dev/demo)** · [管理画面](https://widget-clap.pikoponpoko.workers.dev/admin#projects) · [サービス紹介](https://widget-clap.pikoponpoko.workers.dev/about)

## Cloudflare Workersへのデプロイ

既存のGitHub連携先 `widget-clap` に、リポジトリルートの `wrangler.jsonc` を使用します。

|設定|値|
|---|---|
|Worker名|`widget-clap`|
|リポジトリ|`pikoponpoko/widget_clap`|
|ルートディレクトリ|リポジトリルート `/`|
|Cloudflareのビルドコマンド欄|空欄で可（Wranglerのcustom buildが `npm run build` を実行）|
|デプロイコマンド|`npx wrangler deploy`|
|静的ファイル|`dist`（Viteで生成）|
|Workerエントリーポイント|`server/preview.ts`|
|アプリ用の環境変数・Secrets|不要|
|本番D1・R2・Access・決済設定|不要・この構成では未接続|

Cloudflareのビルド欄に `npm run build` が既に入っている場合も動作します（Wrangler側でもビルドするため2回実行されます）。Node.js 24を推奨します。古いNodeが選択される環境ではビルド変数 `NODE_VERSION=24` を設定してください。

`npx wrangler deploy` は **ビルド → dist検出 → Workerと静的ファイルのアップロード** を行います。`dist` 自体をGit管理する必要はありません。`workers_dev` と `preview_urls` を有効にしています。デプロイ成功ログの **実際のworkers.dev URL** を開いてください。アカウントのサブドメインは実際のログで確認し、推測でURLを作らないでください。

## 今回のブラウザ体験版

- 小さな画像ボタンを押す → 拍手が保存される → お礼イラスト → 任意の匿名感想。感想なしで閉じても拍手は残ります。
- ボタン以外のUIはクリック後にダイアログで開き、埋め込み先の本文や配置を動かしません。
- `/demo` で無料ツール・作品・ブログ末尾への実際の埋め込みを体験できます。設置先ごとに別slugを発行可能です。
- 拍手・感想・お気に入り・お礼・返信・投げ銭を設置先ごとに設定。未接続の投げ銭は公開しません。
- PC・スマートフォンに対応。作品別の `/widget/sample` なども直接開けます。
- `/admin#inbox` から、このブラウザの便りを読み、返信の流れを試せます。
- 入力内容は**このブラウザのlocalStorageだけ**に保存。作者やサーバーには送信しません。実データや秘密情報は入力しないでください。
- 返信確認URLも同じブラウザ内だけで動きます。体験版の管理画面は認証付きの本番Owner画面ではありません。
- 画面上に体験版であることと保存先を明示。外部支援リンク・課金・決済は表示しません。

データベースや決済が未設定でもデプロイできることを優先しています。サーバーAPIへ直接投稿しても503となり、感想の受信・保存は行いません。

## 小さなボタンの設置

自分のページの、ボタンを置きたい位置に貼り付けます。

```html
<script src="https://widget-clap.pikoponpoko.workers.dev/embed.js" data-project="sample" defer></script>
```

標準サイズは128×52px、ボタン画像は120×44pxの範囲に縦横比を維持して表示します。設置先のCSSを変更せず、Shadow DOMとiframeで隔離します。`postMessage` の送信元オリジン・ウィンドウ・インスタンス・作品を検証してから、自分のボタンのお礼画面だけを開きます。ホストのCSPがある場合は、この配信元を `script-src` と `frame-src` へ許可してください。

公開体験版の埋め込みはHTTP/HTTPSのサイトに許可します。Owner版では管理画面に登録したオリジンだけを許可します。体験版の保存領域はブラウザと埋め込み元によって分離・制限される場合があります。作者が実際に受信する本番利用は、D1/R2/Access/Turnstile接続後です。

## ローカルで試す

```sh
npm ci
npm run dev
```

- 埋め込みデモ: http://127.0.0.1:8787/demo
- 小型ボタン単体: http://127.0.0.1:8787/button/sample
- 埋め込み画面: http://127.0.0.1:8787/widget/sample
- このブラウザの受信箱: http://127.0.0.1:8787/admin#inbox

`npm run build` の後、`npm run preview` でも起動できます。ローカルサーバーはループバックのみで待ち受けます。クラウド実行環境のlocalhostは利用者PCのlocalhostと異なります。

## テスト

```sh
npm run check
npm test
# 体験版のローカルサーバーを起動した別ターミナル
npm run test:preview
# 外部へのアップロードなしで、デプロイ用のビルドと構成を検証
npx wrangler deploy --dry-run
```

Playwrightは標準のChromiumを使います。システムのブラウザを使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` を指定できます。

## 後続のOwner版

先行実装したD1/R2・Cloudflare Access対応コードは `server/index.ts` と `wrangler.owner.jsonc` に分離しました。通常の `npx wrangler deploy` では使用されず、本番DBも作成しません。実装済みの返信・画像管理・CSV/JSON・PDF・バックアップ処理は、後続の接続・検証用です。[運用手順](docs/operations.md) と [API仕様](docs/api.md) を参照してください。

Owner版のビルド出力は `dist-owner` に分け、公開体験版の `dist` を上書きしません。ローカルD1/R2エミュレーターで試す場合のみ：

```sh
cp .dev.vars.example .dev.vars
npm run db:local
npm run seed:local
npm run dev:owner
# 別ターミナルで、Owner版の連携テスト
npm run test:e2e
```

Owner版E2EはローカルDBを変更・復元します。実データのある環境では実行しないでください。本番Owner版への切り替えは、D1/R2・Access・Turnstile設定とユーザー承認後に行います。薄いベージュを使わず、パレット決定までは無彩色で構成しています。

PDFの日本語フォントは [SIL Open Font License](public/fonts/LICENSE.txt) に従って同梱しています。[由来と再生成方法](public/fonts/SOURCE.md)。実プリンタ・シール用紙の寸法確認、Safari/iOS、実サイトのテーマA/B/Cは未検証です。
