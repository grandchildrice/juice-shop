# 参加者向けセットアップ

このフォークの `demo` ブランチには、追加した4件のセキュリティ演習と実演手順書が含まれる。各自のPC上で起動でき、LLM・メールサーバー・外部決済サービスの設定は不要。

## 1. ソースを取得

Gitと、DockerまたはNode.js 24を用意する。Docker DesktopはDocker Composeも含む。LinuxでDocker Engineを使用する場合はComposeプラグインも用意する。

```sh
git clone --branch demo --depth 1 https://github.com/grandchildrice/juice-shop.git
cd juice-shop
```

以下のDocker方式とnpm方式のどちらか1つを選ぶ。

## 2-A. Dockerで起動

```sh
docker compose up --build
```

初回はイメージと依存パッケージのダウンロード・ビルドが必要。ログに `Server listening on port 3000` と出たら <http://localhost:3000> を開く。端末で `Ctrl+C` を押すと停止する。

バックグラウンドで動かす場合:

```sh
docker compose up --build -d
docker compose logs -f
```

停止・再起動:

```sh
docker compose down
docker compose up
```

Docker Composeを使用しない場合:

```sh
docker build -t grandchildrice-juice-shop:demo .
docker run --rm -p 127.0.0.1:3000:3000 grandchildrice-juice-shop:demo
```

ポート3000を既に使っている場合は、Composeを起動せず、次のコマンドで3001に割り当てる。

```sh
docker build -t grandchildrice-juice-shop:demo .
docker run --rm -p 127.0.0.1:3001:3000 grandchildrice-juice-shop:demo
```

この場合は <http://localhost:3001> を使う。手順書にあるURLも同じポートに揃える。

## 2-B. npmで起動

Node.js **24**を推奨する。次のコマンドでバージョンを確認する。

```sh
node --version
npm --version
npm install
npm start
```

`npm install` はバックエンドとフロントエンドの依存関係をインストールし、ビルドも実行する。`Server listening on port 3000` と出たら <http://localhost:3000> を開く。停止は端末で `Ctrl+C`。

ソース変更を取り込んだ場合は、停止後に以下を実行する。

```sh
npm install
npm run build
npm start
```

Linuxでネイティブモジュールのビルドエラーになる場合は、PythonやC/C++のビルド環境が必要になることがある。OSごとの構築を避けたい場合はDocker方式を使う。

## 3. アカウントを準備

講師のPCにあるデモアカウントは、各自の環境には自動作成されない。ログイン画面の **Not yet a customer?** から、2つの一般顧客アカウントを登録する。

| 用途 | メールアドレス | パスワード |
| --- | --- | --- |
| A: 対象ユーザー | `demo-owner@juice-sh.op` | `Demo-2026-Local!` |
| B: 操作するユーザー | `demo-user@juice-sh.op` | `Demo-2026-Local!` |

メールアドレスは模擬メールボックスの識別子として使う。実在するメールアドレスの用意は不要。

通常ウィンドウをA、プライベート／シークレットウィンドウをBに割り当てる。住所とカートの準備は [実演手順書の第3章](security-demo-runbook.md#3-アカウント配送先カートの事前準備) に沿って進める。住所IDとカートIDは各自の画面で確認し、講師の数値をそのまま使わない。

## 4. 追加演習を開く

| 演習 | 画面・入口 |
| --- | --- |
| Misdelivered Login Code | ログイン画面の **Sign in by email**、`/#/email-login` と `/#/mailbox` |
| Recipe Paywall Bypass | サイドメニューの **Juice recipes**、`/#/recipes` |
| Signed Out Address Preview | 保存済み配送先の目のアイコン、`/#/address/preview/<住所ID>` |
| Borrowed Delivery Address | 自分のカートから注文確認へ進む、`/#/order-summary` |

`/#/score-board` で4件のチャレンジ名を検索できる。[実演手順書](security-demo-runbook.md)には、正常時との比較、Consoleのコード、期待する結果、復旧手順まで載せている。

**Recipe Paywall Bypassを終えるまで、Deluxe会員にしない。** 通常の一般会員で行う演習のため、既存のDeluxe Fraudは最後に実施する。

## 5. 再実演とトラブル対応

アプリは起動時にデータを初期化する。停止・再起動後は、アカウント・住所・カートなどを再度準備する。解答状況がブラウザから復元される場合は、ブラウザのサイトデータも消してやり直す。[リセット手順](security-demo-runbook.md#112-最初からやり直す場合)を参照。

- **ページを開けない:** ビルド完了と `Server listening on port 3000` のログを確認する。
- **ポート使用中:** もう一方の起動方式を停止するか、Dockerのポートを3001に変える。
- **チャットボットやAlchemyの警告:** 追加4件には不要な外部連携。追加演習の起動可否はアプリの待ち受けログで確認する。
- **新しい演習が見当たらない:** `git branch --show-current` が `demo` か確認し、ソース更新後はイメージまたはnpmのビルドを作り直す。
- **Bで操作しているはずがAになる:** OTP演習後はAとしてログインしている。ログアウトしてBに戻る。
- **その他:** [実演時の停止点と復旧](security-demo-runbook.md#113-よくある停止点)を参照。

## 配布前の動作確認

2026-11-11にLinux x86_64で、ルートのDockerfileからのビルド・起動と、ソースだけをコピーした別環境でのNode.js 24による `npm install`・`npm start` を確認した。Docker版では追加4件の成立経路、npm版ではトップ画面と4件のチャレンジ登録を確認済み。
