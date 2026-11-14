# 開発への参加

不具合の報告、ドキュメントの修正、小さな改善の Pull Request を歓迎します。大きな機能追加や動作の変更は、実装前に Issue で相談してください。

## 不具合を報告する

Issue には、再現する手順、期待した動作、実際の動作、使ったブラウザを書いてください。配色や配点を変更している場合は、関係する設定値もあると確認しやすくなります。API トークンなどの秘密情報は含めないでください。

## 修正する

Node.js 24 と npm を使います。このファイルがあるディレクトリで依存パッケージをインストールし、変更後に次の検査を実行してください。

```sh
npm ci
npm run check
npm run build
npm test
```

ゲームの処理は `src/game.ts`、画面は `templates/game.html`、利用者向けの設定は `config/pinball.json` にあります。設定項目を変えるときは、JSON Schema と README の説明も更新してください。不具合を修正する場合は、その不具合を再現するテストも追加してください。

生成される `dist/` と依存パッケージの `node_modules/` はコミットに含めません。Action の利用者は TypeScript をビルドしないため、`npm run build` で更新される `.action/runtime.js` はコミットに含めてください。配色や画面を変えた場合は、ダークとライトの両方で表示を確認してください。SVG を変更した場合は、生成したファイルを画像として表示し、得点・OVER・増玉・最終得点までの動きを確認してください。README のサンプル画像を更新する場合は、`data/sample.json`、`examples/pinball.json`、初期5玉・seed 1で生成した2テーマを `docs/assets/demo-dark.svg` と `docs/assets/demo-light.svg` へ置きます。

## Pull Request を送る

何を直したか、変更後にどう動くか、実行した検査を短く書いてください。関連する Issue があればリンクを付けてください。

コミットメッセージは、`fix: correct grass collision` のように、英語の1行で `feat:`、`fix:`、`docs:` などの種類を先頭に付けてください。

このプロジェクトは [MIT License](LICENSE) で公開します。
