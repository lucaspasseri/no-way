# Recording the portfolio demos

The README uses recordings of the real application, driven by Playwright and
converted from WebM video to GIF with FFmpeg. Recording is an explicit operation;
`npm test` does not launch a browser or generate media.

## Prerequisites and command

- Node.js 22.15+ and installed npm dependencies (`npm install`).
- PostgreSQL binaries: `pg_config`, `initdb` and `pg_ctl`. Set `PG_BIN` to their
  directory if `pg_config` is not on `PATH`. Run as a normal user, not root.
- FFmpeg and `ffprobe` on `PATH`. For example, macOS users can install PostgreSQL
  and FFmpeg with their usual package manager. `FFMPEG_BIN` and `FFPROBE_BIN`
  can point to other installations.
- The browser and recording binaries matching the installed Playwright version:

```sh
npx playwright install chromium
npm run demos:record
```

By default, Playwright uses its bundled headless Chromium. To use an already
installed Chrome instead, run `PLAYWRIGHT_CHANNEL=chrome npm run demos:record`.
First-time font compilation needs network access for the existing Google Fonts
integration. The browser recordings themselves allow only the local app origin.

The command starts its own server on an available loopback port; it takes no
production URL or database arguments. Each invocation starts with a fresh fixture
database, so duplicate screening does not reject data from a previous run.
It tears down the owned server, database and intermediate videos on completion
or SIGINT/SIGTERM. An abruptly killed process may require manual cleanup of its
OS temporary directory.

## What's recorded

All three GIFs use a **1120 × 1000** browser viewport, reduced motion and English
initial preferences. Frames are encoded at **840 × 750**, 10 fps, with a
128-color palette. Scene boundaries remove navigation/compilation before the
first action. Clips longer than 14.5 seconds are sped up to that length; no fake
application delays or UI changes are introduced. Small pauses in the automation
make the actions and outcomes readable.

| Asset | Journey |
| --- | --- |
| `core-gameplay.gif` | Lock the first curated question, submit 100 then 200, challenge, reveal 149.6, and start another round |
| `ai-lab.gif` | Explore category choices, select a custom topic/difficulty/audience, generate ten fixture questions through real screening, then play one |
| `customization.gif` | Switch to Brazilian Portuguese, change measurements and theme, filter/select a question, and return to English |

The AI clip carries a visible **SIMULATED AI DEMO** caption on every scene.
Fixtures are deliberately generic test questions. Their acceptance demonstrates
schema, screening and navigation behavior, not a live model's topic matching or
factual accuracy. The recorder verifies a ready ten-question pack, five generation
steps and answer-free preview payloads before showing it as a successful batch.

Each GIF has a corresponding PNG still; a separate 390 × 844 touch-enabled
browser context produces `customization-mobile.png`. GitHub readers who prefer
still images can use those instead of the animated previews. The hero and demo
images have descriptive alternative text in the README.

## Isolation and quota protection

The recorder reuses `tests/isolated-preview.mjs`, also used by the manual
`tests/lab-preview.mjs` browser-test server:

1. A new temporary PostgreSQL cluster receives the repository schema and seed.
2. A source copy is created without `.env`, Git metadata or the main `.next` cache.
3. The child server receives an allowlist of host environment variables and a
   fixed, nonsecret test credential. Real provider keys, model overrides, recovery
   settings and inherited Node preloads are not passed through.
4. Only that child process loads `tests/mock-ai-provider.mjs` through
   `NODE_OPTIONS`. The preload requires both an explicit test flag and the test
   credential, then intercepts the provider HTTP boundary. Production source
   does not import it. The real API routes, SDK serialization, validation,
   ownership checks, database persistence and game components still execute.
5. Browser requests to other origins are blocked. No production generation
   endpoint is visited or retried.

The real quota UI is covered separately in `tests/lab-errors.browser.mjs` with
simulated diagnostic responses. This recording workflow does not issue a live
request to reproduce a quota error. Nothing here changes production credentials,
provider limits, retry budgets or model routing.

## Outputs and validation

Assets are written to `docs/assets/demos/`; raw WebM videos live only in the
owned temporary directory. `manifest.json` records the decoded frame count,
dimensions, duration, byte size and simulation flag for each GIF, without machine
paths, credentials or timestamps.

The recorder uses `ffprobe` to require multiple frames, 7–16 seconds of playback
and a file size under 5 MiB per GIF. Decode/readability and repository-relative
README links can also be checked without recording again:

```sh
npm run demos:check
```

For a full regeneration, rerun `npm run demos:record`. Review the stills and GIFs
before publishing changed documentation; passing metadata checks alone does not
establish visual quality. Keep the simulation notice next to the AI clip and in
its captions if editing this presentation later.
