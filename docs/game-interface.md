# Game interface

## Architecture

The app uses Next.js App Router, React, JavaScript, CSS Modules, and react-feather.
The page renders the bundled JSON question bank. There are no player sessions
or synchronization services.

`src/features/game/game-rules.mjs` defines pure guess validation, formatting,
challenge availability and resolution, and the reducer. `useGame.js` supplies
event handlers, timestamps, and guess identifiers. Questions, guesses, locking,
answer reveal, and timer origins have one source of truth. JSDoc documents the
state, actions, and component interfaces.

`Game` composes the header, a full-width `QuestionCard`, `GuessSection`, and a
secondary footer with `GameSettings` and timers. `GuessSection` places guess
entry, `LastGuessSection`, and the answer/result region in one column, with
history alongside on desktop and underneath on mobile. Guess entry and history
use the shell surface directly to avoid nested cards.

## Game controls

`QuestionCard` owns Lock/Unlock, Next Question, and Random Question in a compact
footer toolbar, alongside a visible lock status and an explanation of navigation.
These management controls use secondary styling; submitting and challenging
guesses remain the prominent gameplay decisions.

`LastGuessSection` provides the only Doubt Guess button, paired with the latest
value. It uses the existing `challengeGuess` callback and `canChallengeGuess`
availability rule. The reducer checks availability again against its latest state.
Pass Turn, Forfeit, and a separate No Way action are absent.

- Locking enables guess submission and challenges. Next/Random are disabled
  while locked. Unlocking preserves guesses, the answer reveal, and elapsed time.
- Next advances through the question bank with wraparound. Random selects a
  different question whenever alternatives exist. Selecting another question
  clears only question-specific state: guesses, reveal, lock, and timer origins.
- `GameSettings` is a native, keyboard-operable collapsible section containing
  theme switching and Reset guesses. Reset is enabled for a locked question
  with guesses and calls the existing handler immediately, without a dialog.
  It clears guesses and the reveal and restarts timers, preserving the selected
  question, its lock, and the theme. Opening or closing settings changes no game state.
- The settings theme toggle retains the existing session-memory behavior and
  light default. Theme is independent of the reducer and is not persisted.

## Guess and challenge rules

First guesses may be zero or greater. Later guesses must be strictly higher than
the latest accepted guess. Decimals are supported. Blank, negative, nonnumeric,
and nonfinite input is rejected. Invalid input remains in the field with an
associated error; display formatting never changes comparison values.

A challenge requires a locked question, a valid latest guess, and a finite
answer. It succeeds only when the latest guess exceeds the answer. Equality
favors the guess. Both outcomes reveal the answer inline. A challenge does not
end the round, unlock the question, alter timers, change scores, or advance a
player. Repeating a challenge for the same guess preserves the existing verdict.
A new accepted guess clears the old verdict; a rejected guess preserves it.

History is stored in insertion order and displayed newest first, with sequence
numbers and a labeled current top. The highest guess is derived from the latest
accepted value. Footer timers measure elapsed time, not a countdown.

## Accessibility and interaction

Controls have text labels, 44px touch targets, visible focus, and disabled states.
Question controls explain locking and navigation, while settings describe the
scope and availability of reset. The live question count announces navigation, the persistent
polite result region announces challenges, and history announces accepted guesses.
Motion respects reduced-motion preferences.

## Verification

- `npm run lint` checks the repository.
- `npm test` runs 20 tests covering validation, formatting, locking, queued
  guesses, invalid actions, question selection, reset preserving its question,
  challenge availability, answer comparison, reveal lifecycle, and idempotence.
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
