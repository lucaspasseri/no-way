# Question retrieval and route loading

The project uses Next.js 16.4.5, React 19.3, JavaScript with JSDoc, and CSS Modules.
Cache Components and Partial Prefetching were already enabled. This refactor
keeps that setup, the existing question schema, and all gameplay rules.

## Files

```text
src/
  app/
    page.js                     async Server Component
    loading.js                  automatic Suspense fallback
    loading.module.css          responsive skeleton placeholders
    error.js                    Client Component with retry
    api/questions/
      route.js                  GET handler
      route.test.mjs            success, awaiting, and failure contract tests
  server/
    questions.mjs               shared server-only getQuestions()
    questions.test.mjs          retrieval, validation, and environment tests
  lib/
    delay.mjs                   framework-independent delay(ms)
    delay.test.mjs              deterministic timer tests
  data/questions.json           unchanged question bank
  components/Game/Game.jsx      existing Client Component
  features/game/                existing reducer, types, hook, and rule tests
tests/
  register.mjs                  Node-only shim for the server-only marker
  streaming.test.mjs            real HTTP streaming and API integration checks
  game.browser.mjs              reusable Playwright interaction check
```

## Boundaries and data flow

`page.js` stays a Server Component. It awaits `getQuestions()` directly, then
passes serializable question objects to `Game`. It never fetches its own API.
The existing `Game` client boundary keeps the reducer, events, timers, locking,
guesses, question navigation, challenges, and results in the browser.
`ThemeProvider` remains a client provider in the layout. `error.js` is a Client
Component because its retry button needs an event handler. Loading is rendered
on the server without client state.

Both callers use this single retrieval path:

```text
page.js -----------------------+--> getQuestions() --> questions.json
                               |        |
GET /api/questions ------------+        +--> await delay(1000) in development

page.js --> <Game questions={questions} /> --> existing interactive reducer
API     --> { questions, error: null }
```

The service imports `server-only`, which Next.js rejects inside a client import
graph. It reuses the existing `Question` JSDoc typedef and `getQuestionAnswer`
validation, checks for a nonempty bank with unique integer IDs, and returns
copies so callers cannot mutate the shared JSON objects. IDs, optional metadata,
and string versus numeric answers are preserved. It has no React or HTTP logic.
The delay utility has no framework imports. A database or AI source can later
replace the JSON import inside the service without changing its callers.

## Loading and rendering

Next.js automatically nests `loading.js` inside the segment layout and wraps
`page.js` with Suspense. No manual page-wide boundary is necessary. When the
page suspends, the server streams the skeleton; React replaces it when retrieval
finishes. The skeleton uses existing game, header, question, and guess layout
styles, theme tokens, mobile breakpoints, a loading status, and reduced-motion
support. It reserves space for the question, navigation controls, guess entry,
latest guess, history, and footer. Placeholder heights approximate the initial
question; text wrapping and different fonts can still produce small differences.

An async function returning imported JSON could complete during prerendering.
To make the demonstration observable, the page calls `await connection()` only
when `NODE_ENV === 'development'`. The installed Next.js guide recommends this
API when work must wait for a real user request, including waiting past prefetch.
The service then calls `await delay(1000)` under the same environment condition.
No timer runs during component rendering itself.

Production omits both the request-time opt-in and the timer. With the current
local JSON source, the build prerenders both `/` and `/api/questions` as static
content. The production page does not need to show a loading skeleton. JSON
changes require a rebuild/redeploy. If retrieval later uses live external data,
revisit caching, revalidation, and build-time availability explicitly.

Fresh document navigation or a reload in development demonstrates the fallback.
A reused client-router result or history entry may display immediately; Suspense
only shows a fallback while there is actual pending work.

## API and errors

`GET /api/questions` returns `200` and `{ questions: Question[], error: null }`.
Retrieval failures are logged server-side and return `500` with
`{ questions: null, error: 'Unable to load questions. Please try again.' }` and
`Cache-Control: no-store`. Framework handling supplies `405` for unsupported
methods. The API does not duplicate question loading or validation.

A page retrieval failure reaches `error.js`, which shows a generic game-loading
message without rendering the exception. Its button calls Next.js 16.4.5's
`retry()` prop to refetch and rerender the segment. The installed version's
`reset()` only clears boundary state, so it is not the appropriate recovery
action for a failed server retrieval. Layout failures are outside this segment
boundary. In development, Next.js may separately display its diagnostic overlay.

## Answer exposure and future verification

The client currently resolves challenges against `question.answer` and renders
the answer after success. Therefore full answers remain available in initial
RSC data and the API, even though the gameplay UI hides them until the result.
This is suitable for the existing local game, but it cannot prevent cheating.
The server-only import protects the retrieval module; it does not hide values
explicitly passed to the browser. Public reference links may also reveal answers.

The minimal follow-up is to send public question fields without answers to both
the page and API, then add a server verification action or POST endpoint accepting
a question ID and latest guess. That handler would use the same service to look
up the authoritative answer, validate inputs, apply the existing strict
`guess > answer` rule, and reveal the answer only on success. Keep only challenge
resolution on the server initially. Competitive multiplayer would additionally
need authoritative round/session state so clients cannot fabricate their guesses
or replay arbitrary verification requests. None of that gameplay work is part
of this refactor.

## Verification

Run the unit suite and lint normally:

```sh
npm test
npm run lint
```

All 43 unit tests pass: 35 existing game-rule tests plus eight retrieval, delay,
and API tests. Mock timers prove the exact 1,000 ms development wait and zero
scheduled artificial timers in production/test. Node's experimental module mocks
replace only the service in API failure tests. `tests/register.mjs` substitutes
the server-only marker in Node tests; the Next.js build still enforces the real
server/client boundary. Node 22.15+ is needed for these test hooks.

With `npm run dev` running in another terminal:

```sh
npm run test:integration
```

The development checks passed: the HTTP stream contained the loading fallback
while the question HTML was still pending, then delivered the real game and
initial JSON data. The real API returned the unchanged bank. These assertions
check ordered states rather than fragile elapsed-time thresholds.

For production, build and start in one terminal, then run the checks in another:

```sh
npm run build
npm run start -- --port 3001
```

```sh
TEST_BASE_URL=http://127.0.0.1:3001 TEST_MODE=production npm run test:integration
```

The build and production integration checks passed. The build lists `/` and
`/api/questions` as static; the prerender manifest confirms complete static
responses. Production HTTP checks delivered completed question HTML without an
active loading fallback. The first sandboxed Turbopack build could not open a
worker port; clearing its generated build cache and rerunning with local process
and network access completed successfully. Fonts still require network access.

The repository has no project-wide TypeScript configuration or Node type package.
The existing focused JSDoc check passed, including the new framework-independent
utility:

```sh
node node_modules/typescript/bin/tsc --allowJs --checkJs --noEmit --skipLibCheck --target es2022 --module nodenext src/features/game/game-rules.mjs src/lib/delay.mjs
```

A standalone `checkJs` invocation including the server service reports missing
Node `process` types and the `server-only` ambient declaration. No type packages
were added solely to introduce project-wide checking during this refactor.

`tests/game.browser.mjs` exports `verifyGame(page, options)` for any existing
Playwright runner. Session browser tooling ran it against both development and
production without adding a dependency. To reuse it from a Playwright test:

```js
import verifyGame from './tests/game.browser.mjs';

await verifyGame(page, {
  baseURL: 'http://127.0.0.1:3000',
  development: true, // false for a production server
});
```

Browser verification observed the fallback before the game (about 1.3 seconds
in the recorded development run), with no application API request by the page.
It passed Next/Random selection, locking/unlocking, zero and increasing guesses,
invalid equal guesses, history, reset preserving the question/lock, failed and
successful challenges, new rounds, settings, and theme switching in both modes.
Layout checks at desktop, tablet, 390px, and 320px found no horizontal overflow;
the skeleton and initial game heights differed by less than eight pixels in
those measured viewports. An injected empty bank produced the sanitized real
API failure and route error screen; after restoring the unchanged file, retry
recovered the game. Screen-reader and physical-device testing remain manual.
