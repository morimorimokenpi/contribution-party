# contribution-party

GitHub の活動グラフを、玉が芝を消していく SVG アニメーションにします。生成した画像は GitHub の README に表示できます。得点に応じて玉が増え、パーティーの照明や `OVER` 演出が入り、最後に `FINAL SCORE` と `Happy hacking :)` が表示されます。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/demo-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/demo-light.svg" />
  <img alt="玉が芝を消し、得点とパーティー演出が表示されるサンプル" src="docs/assets/demo-light.svg" />
</picture>

上の画像は全371マスに芝があるサンプルで、演出を確認しやすいよう玉が5個から始まります。通常の初期設定は1個です。実際の活動データを使う場合、芝のあるマスだけが得点になります。取得・更新は利用者側で行い、このツールへ所定形式の JSON を渡します。

ダークとライトの画像を両方生成します。README では自動再生する画像として表示され、操作ボタンはありません。ブラウザで操作できる HTML デモも付属しています。Docker、Web フォント、外部画像は使いません。

SVG の下部には、芝の4色に対応する配点の凡例を表示します。配点は `points` の設定に連動します。途中の得点や玉数は表示せず、最後に最終得点を表示します。

## GitHub Actions で使う

### 1. 芝データを用意する

利用するリポジトリに `data/contributions.json` を用意します。外側の配列が週、内側の配列が日曜日から順に並んだ活動レベルを表します。活動のない日は `0`、活動レベルは `1`〜`4`、期間外は `null` にします。最大53週、1週1〜7日です。

```json
{ "levels": [[0, 1, 2, 3, 4, 0, null]] }
```

この Action は GitHub API を呼びません。最新の芝を使う場合は、後述の workflow の生成 step より前に、自分の取得スクリプトなどでこの JSON を更新してください。このリポジトリの `data/sample.json` を自分のリポジトリの `data/contributions.json` としてコピーすると、サンプルで試せます。

### 2. workflow を追加する

[利用者向けのサンプル](examples/readme-workflow.yml)を、自分のリポジトリの `.github/workflows/contribution-party.yml` へコピーします。サンプルは毎朝10時（日本時間）と手動実行に対応し、生成した画像を `contribution-party-output` ブランチへ保存します。スケジュールは開始時刻が遅れる場合があります。

Action を呼ぶ部分は次のとおりです。

```yaml
- uses: morimorimokenpi/contribution-party@main
  with:
    data_file: data/contributions.json
    output_dir: contribution-party-output
    seed: '1'
    initial_balls: '1'
```

利用例は `@main` を参照するため、このリポジトリの最新の変更が反映されます。特定の実装に固定したい場合は、確認済みのコミット SHA を指定してください。

定期実行で生成し直すのは画像です。入力 JSON の取得・更新を追加しなければ、同じ芝の画像が生成されます。新しい workflow はデフォルトブランチへ置き、初回は Actions 画面の「Run workflow」から実行してください。

### 3. README に画像を表示する

`YOUR_NAME` と `YOUR_REPOSITORY` を、workflow を置いたリポジトリの所有者名とリポジトリ名へ置き換えます。画像の保存ブランチを変更した場合は、URL の `contribution-party-output` も変更してください。

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-light.svg" />
  <img alt="Contribution Party" src="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-light.svg" />
</picture>
```

画像が生成・保存されるまでは表示できません。GitHub の画像キャッシュにより、更新が表示されるまで時間がかかる場合があります。

## Action の入力と出力

| 入力 | 必須 | 初期値・内容 |
| --- | --- | --- |
| `data_file` | はい | 芝データの JSON。利用するリポジトリ内の相対パス |
| `config_file` | いいえ | 省略時は同梱の設定。独自設定を使う場合は利用するリポジトリ内の相対パス |
| `output_dir` | いいえ | `dist`。利用するリポジトリ内の相対パス |
| `seed` | いいえ | `1`。0〜4294967295の整数。同じ入力と seed で同じ動きになる |
| `initial_balls` | いいえ | `1`。初めから5玉にする場合は `5` |

出力は `dark-svg` と `light-svg` です。生成した各 SVG の絶対パスが入ります。ファイル名は `contribution-party-dark.svg` と `contribution-party-light.svg` です。

Node.js 24 で動く JavaScript Action です。利用者が `npm install` や Docker の準備をする必要はありません。画像の生成だけなら書き込み用の GitHub トークンは不要で、サンプル workflow では画像を保存する step が自動発行の `GITHUB_TOKEN` を使います。

## 手元で SVG を生成する

Node.js 24 以降で、このディレクトリ内から次を実行します。Action 用の実行コードは同梱されています。

```sh
node scripts/generate.mjs --data data/real.json --output-dir dist/readme
```

配色などを変更したい場合は `--config config/pinball.json` を指定します。全マスのパーティー演出を試す例です。

```sh
node scripts/generate.mjs --data data/sample.json --config examples/pinball.json --initial-balls 5 --seed 1 --output-dir dist/readme-sample
```

SVG は同じタイミングの計算結果から生成するため、ダークとライトで玉の動きは同じです。最後の得点を3秒表示してから最初へ戻ります。端末で視差効果やアニメーションを減らす設定をしている場合は、最終得点を静止画で表示します。

生成時は、芝の回収が3秒以上進まない場合に壁へ当たった玉の反射方向を調整します。得点は玉と芝が実際に接触した場合だけ加算します。300秒以内に全消去と演出の終了に達しない場合はエラーにします。入力 JSON は各1 MiB、出力 SVG は各5 MiBまでです。

ゲームや描画の TypeScript を変更した場合は、後述の `npm run build` で `.action/runtime.js` も更新してください。このファイルは Action の配布に必要なのでコミットに含めます。

## HTML デモを動かす

Node.js 24 と npm を用意し、この README があるディレクトリで次を実行してください。

```sh
npm install
npm run check
npm run build
npm test
```

| コマンド | 内容 |
| --- | --- |
| `npm install` | TypeScript などの開発用パッケージをインストール |
| `npm run check` | 変数や関数へ渡す値の型を検査 |
| `npm run build` | TypeScript を JavaScript に変換し、HTML を生成 |
| `npm test` | ゲームの動作を確認するテストを実行 |

ビルド後は、次のファイルをブラウザで開いてください。

| ファイル | 内容 |
| --- | --- |
| `dist/index.html` | morimorimokenpi の活動グラフを使うデモ |
| `dist/sample.html` | 全371マスに芝があるサンプル |
| `dist/collisions.html` | 初めから5玉で、玉同士も衝突して軌道が変わるサンプル |
| `dist/super-party.html` | 初めは5玉、1000点を超えると10玉になるSUPER PARTYサンプル |

## テーマと配色を変える

HTML デモの画面の「テーマ」で、ダーク、ライト、端末の設定に合わせる表示を選べます。選んだ値はブラウザに保存され、次回も優先して使われます。保存できない環境では、その画面を開いている間だけ切り替わります。

SVG と HTML の設定と配色は [`config/pinball.json`](config/pinball.json) にあります。たとえば玉をターコイズにする場合は `ball`、芝の色を変える場合は `grass` を編集してください。SVG は `--config` または Action の `config_file` で設定ファイルを指定し、生成し直すと反映されます。HTML は設定の変更後に `npm run build` を実行してください。

```json
{
  "$schema": "./pinball.schema.json",
  "theme": "dark",
  "ballCollisions": false,
  "points": [0, 1, 3, 5, 10],
  "overInterval": 100,
  "partyScore": 500,
  "superPartyScore": null,
  "palettes": {
    "dark": {
      "background": "#0C1116",
      "foreground": "#E6EDF3",
      "mutedForeground": "#A5B1BD",
      "surface": "#161B22",
      "border": "#455D77",
      "ball": "#0ABAB5",
      "grass": ["#161B22", "#263444", "#455D77", "#62809C", "#94B1C9"],
      "celebration": "#0ABAB5",
      "lights": ["#0ABAB5", "#64A1F4", "#94B1C9"]
    },
    "light": {
      "background": "#F6F8FA",
      "foreground": "#1F2328",
      "mutedForeground": "#59636E",
      "surface": "#FFFFFF",
      "border": "#B6C2CF",
      "ball": "#008F8B",
      "grass": ["#EBEDF0", "#D4E2EF", "#A0BDD6", "#6C94B7", "#416B8E"],
      "celebration": "#007C78",
      "lights": ["#0ABAB5", "#3C7DD9", "#94B1C9"]
    }
  }
}
```

| 設定 | 変わる部分 |
| --- | --- |
| `theme` | HTML デモの初回のテーマ。`dark`、`light`、`auto` から選択 |
| `ballCollisions` | `true` で玉同士の弾性衝突を有効化。省略時は `false` |
| `superPartyScore` | 10玉に増える境界。`null` または省略で無効 |
| `background` / `surface` | ゲーム全体の背景 / 操作ボタンなどの背景 |
| `foreground` / `mutedForeground` | 通常の文字 / 補足の文字 |
| `border` | 枠線 |
| `ball` | 玉とその軌跡 |
| `grass` | 活動レベル0〜4のマス。0は活動がない日の色 |
| `celebration` | `OVER` や最終得点の演出 |
| `lights` | パーティー中の3色の照明 |

色は `#0ABAB5` のような6桁のカラーコードで指定します。`grass` は5色、`lights` は3色が必要です。省略せず、ダークとライトの両方の配色を設定してください。[JSON Schema](config/pinball.schema.json) に設定値の形式を定義しています。対応するエディターでは、入力中にも誤りを確認できます。

`$schema` はエディターに設定形式を伝えるための項目で、省略できます。`ballCollisions` と `superPartyScore` も省略でき、初期値はそれぞれ `false` と `null` です。それ以外の設定項目はすべて必要です。

SVG はダーク・ライトの両方を生成するため、`theme` は HTML デモで使います。HTML デモでテーマを決める順番は、埋め込み先に保存された選択、ブラウザに保存された選択、`theme` の設定値の順です。`auto` の場合は端末のライト／ダーク設定に従います。`theme` を変更しても、以前に保存した選択があれば、その選択が優先されます。通常の単独 HTML では、ブラウザの `localStorage` に `contribution-pinball:theme` という名前で選択を保存します。

## 得点と演出

`points` は活動レベル0〜4の配点です。5個の非負整数を指定し、先頭は `0` にします。初期設定では、活動レベル1から順に1・3・5・10点として数えます。GitHub に表示されるコントリビューション数と、このゲームの得点は別の集計です。

合計得点が JavaScript の安全な整数の上限（`Number.MAX_SAFE_INTEGER`）を超える設定は、ビルド時とゲーム起動時にエラーになります。

`overInterval` は `OVER` 演出の間隔で、1以上の整数を指定します。初期設定では100、200、300点などの境界を超えたときに演出が出ます。100点ちょうどの場合は次の加点を待ちます。

超えた境界の `OVER` は、玉の数にかかわらず1件につき1.6秒ずつ順番に表示します。極端な配点で保留中の `OVER` が32件を超える場合は、保留分を最新の境界1件へまとめます。

`partyScore` は自動で玉が5個になる境界で、0以上の整数を指定します。初期設定では500点を超えると照明が点き、自動パーティーが始まります。500点ちょうどでは始まらず、501点以上が条件です。「パーティー！ ×5」ボタンでも玉を5個にできます。全消去後は照明が約1秒で消え、残っている演出が終わると `FINAL SCORE` と最終得点が表示されます。

付属の実データは、2026年11月8日に取得した2025年11月9日から2026年11月8日までの活動グラフです。活動がある51マスをすべて消すと、初期配点で127点になります。全371マスのサンプルは合計1,764点で、500点超えの自動演出も試せます。`points` を変えると合計点も変わります。

`ballCollisions` を `true` にすると、複数の玉が互いに弾性衝突して軌道が変わります。衝突サンプルの `dist/collisions.html` では、通常の設定にかかわらずこの機能を有効にし、初めから5玉を用意します。

`superPartyScore` に `partyScore` 以上の非負整数を設定すると、その値を超えたときに一度だけ `SUPER PARTY TIME` が表示され、玉が10個になります。`null` または省略時は無効です。専用の `dist/super-party.html` は初めから5玉で始まり、1000点を超えると10玉へ増えます。1000点ちょうどでは増えません。10玉になった後も玉同士の衝突は続きます。SUPER開始時には3色のリングと短い放射光が広がり、約1.4秒で滑らかに消えます。

## データと対応範囲

付属デモは、取得済みの活動グラフを JSON に保存したスナップショットです。活動データの取得・更新は利用者側で行い、このツールには所定形式の `levels` を渡します。ブラウザでユーザー名を入力して最新データを取得する機能はありません。

`data/real.json` を別の活動グラフに置き換えると、自分のデータでビルドできます。`levels` の外側の配列が週、内側の配列が日曜日から始まる1〜7日分を表します。`0` は活動がない日、`1`〜`4` は活動レベルです。`null` は表示対象外の日付を表し、描画と衝突判定から除外します。付属データでは、未来の日付に `null` を使っています。

入力には `levels` だけあれば利用できます。次は、1日分の芝を持つ最小の例です。

```json
{ "levels": [[1]] }
```

`username`、`retrievedAt`、`start`、`end` は任意の補足情報です。空でない文字列を設定した場合だけ表示に使います。省略した情報は表示せず、ユーザー名がなければ「活動データ」と表示します。期間は開始日と終了日の両方がある場合に表示します。

入力した `levels` は、ビルド時とゲーム起動時に同じ規則で検査します。

`data/real-source.json` には、実データを取得したときの元のレスポンスを保存しています。日ごとのデータを、ゲームで使う配列と照合できます。

README 用の出力形式はアニメーション SVG です。GIF の生成には対応していません。SVG と HTML デモは同じ設定・配点・衝突計算を使いますが、生成時の回収補助や乱数の使用順が異なるため、軌道は完全には一致しません。

## 開発する場合

| ファイル | 編集する内容 |
| --- | --- |
| `config/pinball.json` | 初期テーマ、配色、配点、演出の境界 |
| `config/pinball.schema.json` | JSON 設定値の形式 |
| `src/game.ts` | 玉の動き、衝突、得点、テーマ切り替え、演出 |
| `src/settings.ts` | 設定値の検査と配色・テーマの型定義 |
| `src/contributions.ts` | 活動データの型定義と `levels` の検査 |
| `src/physics.ts` | 玉同士の衝突判定と速度の計算 |
| `src/animation.ts` | SVG 用の軌道・接触時刻・得点・演出の計算 |
| `src/svg.ts` | JavaScript を使わないアニメーション SVG の描画 |
| `src/svg-motion.ts` | 玉の残像と接触時の火花の描画 |
| `src/svg-lights.ts` | ビームと上下のライトの描画 |
| `scripts/generate.mjs` | 芝データと設定を受け取って2テーマの SVG を生成 |
| `scripts/action.mjs` / `action.yml` | GitHub Action の入力・出力と実行処理 |
| `examples/readme-workflow.yml` | 利用者向けの定期生成・保存の例 |
| `src/celebration.ts` | SUPER開始時のリングと放射光の描画 |
| `templates/game.html` | 操作ボタン、得点表示、レイアウトと CSS |
| `data/real.json` / `data/sample.json` | ゲームで使う活動グラフ |
| `scripts/build.mjs` | JavaScript と設定、データを HTML にまとめる処理 |
| `tests/` | 動作を確認するテスト |

`dist/` はビルドのたびに生成されるため、直接編集せず元のファイルを変更してください。生成される `real.fragment.html`、`sample.fragment.html`、`collision.fragment.html`、`super-party.fragment.html` は、スタイルとスクリプトを含む埋め込み用 HTML です。単独ページ用のボタンなどの基本スタイルは、`scripts/build.mjs` にあります。

プレビュー用の保存先も更新する場合は、次のように指定できます。指定しない場合は `dist/` のみを更新します。

```sh
npm run build -- --preview-dir /absolute/path/to/preview-directory
```

指定先の `contribution-bounce-real.html`、`contribution-bounce-score.html`、`contribution-bounce-collisions.html`、`contribution-bounce-super-party.html` を、生成した埋め込み用 HTML で上書きします。

不具合の報告や修正は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。GitHub Actions の CI は、型の検査、ビルド、テストを実行する構成です。利用者向けの画像公開は `examples/readme-workflow.yml` を参照してください。

## ライセンス

MIT License で公開します。条件は [LICENSE](LICENSE) を参照してください。生成した SVG と HTML、Action の配布コードにも、ライセンスと著作権の表記を含めています。
