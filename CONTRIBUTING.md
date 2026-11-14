# Contributing

Bug reports and small fixes are welcome. Open an issue before starting a large feature or behavior change.

For bugs, include reproduction steps, expected and actual behavior, your browser, and any relevant custom settings. Keep tokens and other secrets out of reports.

## Development

Use Node.js 24 and npm. Run these commands from the repository root:

```sh
npm ci
npm run lint
npm run format:check
npm run check
npm run build
npm test
```

Use `npm run format` to format source files with Biome.

Open `dist/index.html` in a browser for the interactive HTML demo.

The game is in `src/game.ts`, the UI in `templates/game.html`, and configuration in `config/pinball.json`. Update the schema and README when changing settings, and add a regression test for bug fixes.

Commit the `.action/runtime.js` produced by the build; Action users do not compile TypeScript. Keep `dist/` and `node_modules/` out of commits.

Check both themes after visual changes. For SVG changes, view the generated animation through scoring, `OVER`, party effects, and the final score. Regenerate README previews with `data/sample.json`, `examples/pinball.json`, 5 initial balls, and seed 1, then save both themes as `docs/assets/demo-dark.svg` and `docs/assets/demo-light.svg`.

## Pull requests

Describe the change and the checks you ran, and link related issues. Use a one-line English Conventional Commit message, such as `fix: correct grass collision`.

This project uses the [MIT License](LICENSE).
