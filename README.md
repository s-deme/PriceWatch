# PriceWatch

価格履歴・ショップ比較・送料・クーポンをもとに「本当に安いか」を確認する、個人利用向け価格監視アプリです。サンプルの商品名は実在しますが、**掲載価格・在庫・イベント・クーポンはすべて架空**です。

## 主な機能

- Dashboard：HOT DEALS、新着、過去最安、値下げ、終了間近
- 商品名・メーカー・型番・JAN・ショップの部分一致検索、カテゴリ等の絞り込み、7種類の並び替え
- 複数ショップの支払価格比較、ポイント考慮価格、7/30/90日平均、期間切替付き価格履歴
- 根拠を確認できるDeal Score、商品ごとのお気に入り・価格監視、アプリ内通知
- 包含・除外キーワード監視、クーポン一覧、セールイベント
- 認証付き管理画面、JSON検証・投入、独立ワーカー、取得ジョブの結果表示

## システム構成

Next.js App Router / React / TypeScript / Tailwind CSS / Prisma / PostgreSQL。
画面とServer Actionsからサービス層を呼び出します。価格計算と照合はDBに依存しない関数です。ジョブはWebサーバー外で同じ取り込みサービスを実行します。

```text
src/app/          画面、認証された更新操作
src/components/  カード・フォーム・価格チャート
src/lib/         DB、認証、価格計算、正規化
src/services/    検索、取り込み、管理、ジョブ
src/sources/     PriceSource、MockSource、ManualSource
src/worker.ts    独立したジョブ実行プロセス
prisma/          スキーマ、マイグレーション、Seed
tests/           単体、PostgreSQL結合、ブラウザE2E
```

## 開発環境・起動

Node.js 24、npm、Dockerを使用します。以下のコマンドはプロジェクト直下で実行してください。Windows PowerShellでスクリプト実行制限がある場合は `npm.cmd` / `npx.cmd` を使用します。

```sh
cp .env.example .env
# .envのADMIN_PASSWORD（12文字以上）とSESSION_SECRET（32文字以上）を変更
npm ci
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

http://localhost:3000 を開きます。別ターミナルで `npm run worker` を実行すると、キュー処理と定期取得が動きます。`/login` では `.env` の `ADMIN_PASSWORD` を使用します。会員登録はありません。

`npm run worker -- --once` でキューを1件だけ処理して終了できます。継続運用は通常の `npm run worker` を使用してください。

`.env` はGit対象外です。`APP_ORIGIN` はブラウザで開く正確なオリジンに合わせてください。HTTPSで使用するとセッションCookieにSecure属性が付きます。個人の監視・通知・管理操作はログイン必須です。

| 変数                    | 用途                                   |
| ----------------------- | -------------------------------------- |
| DATABASE_URL            | PostgreSQL接続先                       |
| ADMIN_PASSWORD          | 個人用ログインパスワード               |
| SESSION_SECRET          | セッショントークンのHMAC鍵             |
| APP_ORIGIN              | 許可する更新リクエストのOrigin         |
| WORKER_INTERVAL_SECONDS | Mock定期取得間隔（既定3600、最小60秒） |

## Dockerで起動

```sh
docker compose up -d --build
docker compose exec web npm run db:seed
```

Webは3000、PostgreSQLはローカルの5434ポートです。DBは名前付きボリュームに永続化します。初期化は `db:migrate`、サンプル投入は `db:seed` です。Seedは既存レコードを削除せず、30商品・90販売ページ・100日分の履歴を追加します。繰り返しても同じ商品・履歴を増殖させません。

```sh
docker compose stop
docker compose up -d
```

停止・再開でデータは残ります。`down -v` はデータを消すため、通常の停止には使用しないでください。

## データと価格の扱い

- ProductとListingは1:N。PriceHistoryは販売ページ単位、Dealはセール区間単位です。
- 金額はJPYの整数。支払価格＝商品価格−適用クーポン＋送料。ポイント考慮実質価格＝支払価格−ポイント相当額（下限0）。送料不明は支払価格を確定しません。
- クーポンはImport時に `couponId` を明示。ショップ・期間・最低購入額を確認し、1枚だけ適用します。ポイントは現金値引きではありません。
- 履歴は変化時、または日本時間でその日の最初の取得時に保存します。平均は時間加重、同じ通貨・在庫ありの観測だけが対象です。48時間以降は未観測として平均から除外し、カバー率を表示します。
- 最安判定は現在の観測より前の記録がある場合だけ行います。「記録開始以来」は市場全体での過去最安を意味しません。
- Score：90日平均比最大40点（20%低下で満点）、過去最安30点、通常価格比最大20点（30%引きで満点）、他店比較5点、送料無料5点。データ不足の項目は加点しません。
- JAN→UPC→メーカー＋型番→メーカー＋正規化名で照合。矛盾・複数候補はエラーにしてJobsに残します。管理画面で識別子を修正して再投入してください。
- 商品価格の編集はImportを使います。Listing管理では掲載の有効・無効を変更します。価格を直接変更して履歴だけ取り残す操作は用意していません。
- 監視条件はいずれかが成立した際に通知し、同じ条件が成立し続ける間は繰り返しません。キーワードは登録後の新規Dealに適用し、カンマ区切りの包含語のいずれか一致、除外語は優先です。

## 取り込みとSource追加

`/admin/import` のJSON例を編集し、事前検証してから投入します。最大100件・500KB。各行を独立したトランザクションで処理し、成功・失敗件数とエラーはJobsに記録します。外部URLをサーバーから取得する処理はありません。

`PriceSource` は `searchProducts`、`fetchProduct`、`fetchPrice` を公開します。`SourceProduct` / `PriceResult` が共通の入出力型です。

1. `src/sources/` にアダプターを作り、SourceProductの形式へ変換する。
2. Sourceを登録し、`src/services/jobs.ts` のアダプター選択に追加する。
3. 取得結果を `ingest` に渡す。DB更新、履歴、Deal、通知をアダプターから直接操作しない。
4. 外部通信を追加する際は、許可ホスト、DNS解決後のプライベートIP拒否、リダイレクト再検証、タイムアウト、サイズ制限、取得先規約を実装する。
5. 正常・失敗・再実行のテストを追加する。

MockSourceは現在値を再観測します。ランダムな値動きで実際のセールを装いません。ManualSourceは利用者が渡したデータのみを扱います。取得元の信頼度と確認状態は別項目で、サンプルは未検証として表示します。

## テスト・品質確認

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

結合テストは `.env` のDB内の専用スキーマ `pricewatch_test` を使用します。E2Eは専用スキーマ `pricewatch_e2e` だけを毎回初期化・Seed投入し、localhost:3100で専用サーバーを起動します。どちらもアプリのスキーマには書き込みません。CIでもPostgreSQLを起動して同じ検証を行います。

### 実施した検証

2026-10-05時点で、lint・format確認・型チェック、単体9件・DB結合7件・E2E5件、本番ビルド、PC/モバイル表示を確認しました。DockerでWeb・DB・ワーカーを起動し、Web再起動後の応答と30商品・90販売情報・9,180件の履歴保持も確認しています。Mock取得は90件成功・0件失敗でした。

Windowsの作業ドライブで多数の小ファイルの処理が遅いため、npm検証は同じソースを一時ディレクトリにコピーして実施し、Dockerでも本番ビルドを確認しました。ローカル開発を始める場合は上記の `npm ci` から実行してください。GitHub Actions上のCI実行と実ECサイト接続は未検証です。

## 運用上の範囲

取り込み更新はPostgreSQLのトランザクション単位のアドバイザリーロックで直列化します。個人用MVPの同時インポート・ジョブの整合性を優先した設計です。並列ワーカーを増やす段階で商品識別子ごとのロックへ分割します。

個人利用・単一ワーカーのMVPです。実EC連携、メールやPush送信、為替変換、公開デプロイは含みません。ジョブは30分を超えると異常終了扱いになり再投入できます。外部取得を増やす際はジョブの分割・リース更新を追加してください。DB制約・履歴インデックスを備えますが、数百万件での性能試験は行っていません。長期運用では履歴パーティション・日次集計・バックアップ運用を追加してください。
