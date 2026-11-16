# Game interface

## Architecture

The app uses Next.js App Router, React, JavaScript, CSS Modules, and react-feather.
The async Server Component page retrieves one curated PostgreSQL question and compact pool metadata through
`src/server/questions.mjs` and passes only public fields into the `Game` Client Component. The
same service backs `GET /api/questions`. Automatic loading and route error states
are described in [Question service](question-service.md). There are no player
sessions or synchronization services.

`src/features/game/game-rules.mjs` defines pure guess validation, formatting,
challenge availability and resolution, and the reducer. `useGame.js` supplies
event handlers, timestamps, and guess identifiers. Questions, guesses, locking,
challenge results, and timer origins have one source of truth. JSDoc documents the
state, actions, and component interfaces.

`Game` composes the header with `GameSettings`, a full-width `QuestionCard`,
`GuessSection`, and a secondary timer footer during the `playing` phase.
`GuessSection` places guess entry and `LastGuessSection` in one column, with
history alongside on desktop and underneath on mobile. Guess entry and history
use the shell surface directly to avoid nested cards.

In the `result` phase, `GameResult` replaces gameplay and timers while retaining
the header and settings. It shows the outcome, original question, numerical
comparison, and any real explanation or source from the question bank. It uses
a question snapshot recorded by the reducer so the resolved round stays stable.
There are no player identities or scores to display.

## Game controls

`QuestionCard` owns Lock/Unlock, Next Question, and Random Question in a compact
footer toolbar, alongside a visible lock status and an explanation of navigation.
These management controls use secondary styling; submitting and challenging
guesses remain the prominent gameplay decisions.

`LastGuessSection` provides the only Doubt Guess button, paired with the latest
value, directly beneath it. It uses the existing `challengeGuess` callback and `canChallengeGuess`
availability rule. The reducer checks availability again against its latest state.
Pass Turn, Forfeit, and a separate No Way action are absent.

- Locking enables guess submission and challenges. Next/Random are disabled
  while locked. Unlocking preserves guesses and elapsed time during play.
- Next advances by database ID within selected category/difficulty preferences, with wraparound. Random
  prefers unseen session IDs and selects a different question whenever alternatives exist. Selecting another question
  clears only question-specific state: guesses, result, lock, and timer origins.
- `GameSettings` is a native modal `<dialog>` containing language, measurements,
  theme switching and Reset guesses. Its top layer escapes card clipping and
  decorative stacking contexts. Reset is enabled for a locked question
  with guesses and calls the existing handler immediately.
  It clears guesses and restarts timers, preserving the selected
  question, its lock, and the theme. Opening or closing settings changes no game state.
  Reset is disabled after a round resolves; it cannot dismiss a result.
- The settings theme toggle retains the existing session-memory behavior and
  light default. Theme is independent of the reducer and is not persisted.

## Guess and challenge rules

First guesses may be zero or greater. Later guesses must be strictly higher than
the latest accepted guess. Decimals are supported. Blank, negative, nonnumeric,
and nonfinite input is rejected. Invalid input remains in the field with an
associated error; display formatting never changes comparison values.

A challenge requires the `playing` phase, a locked question, and a valid latest guess.
`POST /api/challenge` retrieves the curated answer and checks it on the server. It succeeds only when the latest guess exceeds the answer. Equality
favors the guess. Only a successful challenge enters `result` and captures the latest
guess, numerical answer, outcome, and original question with its metadata. A failed
challenge stays in `playing`, preserving the question, guesses, lock, and timers.
It stores only the unsuccessful outcome and shows nonblocking inline feedback;
the next accepted guess clears that feedback. There is no penalty or turn switch.
Every gameplay action is ignored after a successful challenge, including queued guesses, reset,
unlock, question selection, and repeated challenges. Stale challenges for a
previous question are rejected. Pending requests announce progress, prevent duplicate
challenges, and ignore responses after reset, unlock, question changes, or a newer
guess. Network/database errors preserve the round and offer retry. The numerical
answer, explanation, and source are sent to the browser only in a successful result.

Play another round requests the next matching curated question from the server, with wraparound,
clears the previous result, guesses, and timer origins, and returns to `playing`
with the next question unlocked. A multi-question bank advances to a different
question; after reaching the end it wraps around. Repeated next-round actions cannot skip questions. If the next question is
missing or invalid, the result stays visible with an error and a retry action.
Initial question retrieval is asynchronous on the server; explicit subsequent selection
uses the filtered questions API. Preferences sit in the card footer and remain available
on results; changing them preserves the active question, lock and guesses. Counts and
metadata badges make the selected pool and current question distinct. See
[Question service](question-service.md#player-question-selection) for request, history,
persistence, empty-pool and race-handling details.
Differences use base-ten subtraction to avoid floating-point display
artifacts while preserving decimal precision.

History is stored in insertion order and displayed newest first, with sequence
numbers and a labeled current top. The highest guess is derived from the latest
accepted value. Footer timers measure elapsed time, not a countdown.

## Accessibility and interaction

Controls have text labels, 44px touch targets, visible focus, and disabled states.
Question controls explain locking and navigation, while settings describe the
scope and availability of reset. The live question count announces navigation,
and history announces accepted guesses. A phase transition moves focus to the
outcome heading (with its description), or to the new question heading when
another round begins. Failed challenges announce feedback through a polite status
region without moving focus. The result and comparison have brief, staggered entrances.
Motion respects reduced-motion preferences.
Settings makes the underlying page inert and uses native focus management. Escape,
the close button, clicking the backdrop, and Reset dismiss it and restore trigger
focus. Its content scrolls within the viewport on narrow or short screens.

The shared branding links home through App Router navigation, retaining in-memory
game sessions. A red speech bubble with a white question mark is shared by the
header, loading skeleton and `app/icon.svg`; `app/favicon.ico` contains matching
16, 32 and 48 pixel fallbacks. Next.js file conventions provide their metadata.
The initial skeleton announces progress through a visually hidden status. Later
question selection keeps the current content and announces loading or errors in
the existing preferences status region. The question area exposes `aria-busy`.

AI batch results retain the pack origin. During a batch, the existing next-round
action remains primary. At the end, it is replaced by **Generate another batch**,
which opens `/question-lab?configure=1` with saved preferences and awaits an
explicit generation action. **Back to AI Lab** restores the saved generation
summary; **Back to main game** restores the curated session. Partial packs end at
their actual available count. Session metadata counts distinct questions with
accepted guesses, so skipped questions are not reported as played. The underlying
round reducer and challenge rules remain the same.

## Verification

- `npm run lint` checks the repository.
- `npm test` covers validation, formatting, locking, queued
  guesses, invalid actions, question selection, reset preserving its question,
  challenge availability, failed challenges preserving gameplay and hiding answers,
  equality, continued guessing after failure, result snapshots, stale challenges, frozen
  gameplay after resolution, next-round wraparound, repeated clicks, unavailable
  next questions and retries, optional metadata, and precise decimal differences.
  It also covers PostgreSQL retrieval, development-only latency, delay utility,
  public API success and failure contracts, pool reuse, seed transactions, and
  reset safeguards. `npm run test:db` reads the sole configured database to check
  the actual schema and seed compatibility without changing data.
- `npm run test:integration` checks real development streaming and the API with
  a running server. See [Question service](question-service.md) for production
  checks and the reusable browser verification helper.
- The rules module can be checked with the installed TypeScript compiler:
  `node node_modules/typescript/bin/tsc --allowJs --checkJs --noEmit --skipLibCheck --target es2022 --module nodenext src/features/game/game-rules.mjs`.
  This JavaScript project has no project-wide TypeScript configuration.
- `npm run build` compiles and prerenders the application.
- Session browser tooling checks the sole contextual challenge entry point,
  zero/decimal/invalid guesses, keyboard controls, locking, next/random behavior,
  question-bank wraparound, immediate reset and its scope, theme switching,
  obsolete-action absence, responsive layouts, large values, and accessibility.

The repository has no configured end-to-end runner. Browser checks use already
installed session tooling and add no dependency. Automated checks do not replace
manual screen-reader or real-device testing. Clean builds require network access
for the existing Google Fonts integration.

`tests/ui-polish.browser.mjs` exports a Playwright helper for settings layering,
focus, dismissal and scrolling at 320/390/768/1440 pixels, loading/error retention,
branding navigation, session preservation and favicon responses. Pass it a fresh
Page and the same preview options as `tests/question-lab.browser.mjs`. The latter
also completes a partial batch, checks played counts, and exercises both result
links back to the Lab without automatic generation. Start generation checks with
a fresh `tests/lab-preview.mjs` database: previously used fixtures are correctly
rejected as duplicates on repeat runs.
