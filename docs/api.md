# データとAPI

認証境界は `server/security.ts`、SQLは `migrations/0001_initial.sql`、ルーティングは `server/index.ts`。

## データ

|テーブル|用途|
|---|---|
|projects|固定Owner、作品名・スラッグ、許可オリジン、機能ON/OFF、お礼表示方式、外部支援リンクの確認状態|
|claps|作品・日時、短期匿名キーから生成した重複排除ハッシュ|
|messages|本文・日時・既読・非表示、任意公開同意、返信トークンハッシュ、再送重複排除キー|
|replies|感想ごとに1件の編集可能な非公開返信|
|assets|作品・用途・R2キー・MIME・容量。公開素材のみ|
|rate_limits|日替わりHMACを用いた短期回数制限|
|audit_logs|Owner操作の種類・対象ID・日時。90日保持|
|backup_runs|非公開R2へのバックアップ成功記録|

`projects.owner_id='owner'` はDB制約。認証ユーザーは環境設定のOwnerに固定。将来のFree/Pro用ユーザー登録・契約・決済テーブルは未作成。

## 公開API

|メソッド・パス|処理|
|---|---|
|GET /api/public/projects/:slug|公開設定と公開画像一覧。非公開設定は返さない|
|POST /api/public/projects/:slug/claps|拍手。`counted` は集計への追加有無|
|POST /api/public/projects/:slug/messages|感想送信。body, publication_consent, request_id(UUID), started_at, website(空), turnstile。成功時だけ返信トークンを返す|
|POST /api/public/reply|tokenを照合し、対象感想と返信のみ返す|
|GET /api/public/assets/:id|公開画像バイナリ|

送信エラーは `{error: string}`。入力400、未許可403、未発見404、競合409、大容量413、形式415、頻度超過429、設定不備・容量503。生トークンはDBに保存しない。メッセージの再送時は同じrequest_idを使い、現在の返信URLが無効化・再発行されていなければ同じトークンを返す。

## Owner API

以下すべて署名検証済みOwnerのみ。変更操作はOrigin一致必須。

|メソッド・パス|処理|
|---|---|
|GET /api/owner/session|Owner権限・課金免除・ローカル判定|
|GET, POST /api/owner/projects|設置先一覧・作成|
|PUT /api/owner/projects/:id|作品設定|
|GET /api/owner/messages|project/status/pageで絞り込み、50件ページング|
|PATCH, DELETE /api/owner/messages/:id|既読・非表示の変更、個別削除|
|PUT /api/owner/messages/:id/reply|非公開返信を保存|
|POST /api/owner/messages/:id/reply-token|revoke / rotate|
|GET, POST /api/owner/projects/:id/assets|画像一覧・バイナリ登録（kind=button/thanks）|
|DELETE /api/owner/assets/:id|公開画像削除|
|GET /api/owner/stats|project/from/toによる日別集計（UTC）|
|GET /api/owner/export|format=csv/json、任意のproject|
|GET /api/owner/backup|画像込み完全バックアップ|
|GET /api/owner/backup-status|日次バックアップの最新成功日時|
|POST /api/owner/backup-now|非公開R2へ即時バックアップ|
|POST /api/owner/restore|完全JSON復元。「復元する」の確認文字列必須|
|POST /api/owner/delete-messages|感想と返信を全削除。確認文字列必須|
|POST /api/owner/purge|画像・バックアップを含む全消去。確認文字列必須|
