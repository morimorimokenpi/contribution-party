# contribution-party

Animated GitHub contribution pinball for your README.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/demo-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/demo-light.svg" />
  <img alt="Contribution Party animation with score milestones and party effects" src="docs/assets/demo-light.svg" />
</picture>

The preview uses a full grid and starts with five balls. Animations start with one ball by default.

## Usage

1. Create `data/contributions.json` in your repository:

   ```json
   { "levels": [[0, 1, 2, 3, 4, 0, null]] }
   ```

   Each inner array is a week, starting on Sunday. Use `0` for no activity, `1` to `4` for activity levels, and `null` for dates outside the displayed period. Up to 53 weeks are supported.

2. Copy the [example workflow](examples/readme-workflow.yml) to `.github/workflows/contribution-party.yml`. It runs daily at 01:00 UTC (10:00 JST) or manually, then saves both themes to the `contribution-party-output` branch.

   Fetch and update your contribution JSON before the generation step. The action does not fetch data from GitHub. You can copy `data/sample.json` to try it first.

3. Add this to your README, replacing `YOUR_NAME` and `YOUR_REPOSITORY`:

   ```html
   <picture>
     <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-dark.svg" />
     <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-light.svg" />
     <img alt="Contribution Party" src="https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPOSITORY/contribution-party-output/contribution-party-light.svg" />
   </picture>
   ```

Run the workflow once before the images can appear. The example uses `@v0.1.0`; use a commit SHA to pin the exact code.

## Configuration

| Action input    | Default               | Description                         |
| --------------- | --------------------- | ----------------------------------- |
| `data_file`     | Required              | Path to your contribution JSON      |
| `config_file`   | Bundled configuration | Path to a custom configuration JSON |
| `output_dir`    | `dist`                | Directory for generated SVGs        |
| `seed`          | `1`                   | Random seed, from 0 to 4294967295   |
| `initial_balls` | `1`                   | Start with `1` or `5` balls         |

Paths are relative to your repository. Outputs `dark-svg` and `light-svg` contain the absolute paths to the generated files.

Customize colors, points, and party thresholds with [config/pinball.json](config/pinball.json). See the [JSON Schema](config/pinball.schema.json) for valid values.

Default point values are `[0, 1, 3, 5, 10]`. The party starts above 500 points and increases the ball count to five. Set `superPartyScore` to enable a ten-ball SUPER PARTY; it is disabled by default.

## Local use

With Node.js 24 or later:

```sh
node scripts/generate.mjs --data data/real.json --output-dir dist/readme
```

Add `--config config/pinball.json` to use custom settings. Both SVG themes loop automatically and show a static final score when reduced motion is enabled.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and the interactive HTML demos.

## License

[MIT](LICENSE)
