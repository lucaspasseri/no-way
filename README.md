# No Way — Party Trivia

A number-guessing game built with Next.js App Router, React, JavaScript,
and CSS Modules. Browse the question bank, lock a question, submit increasing
guesses, and challenge the latest guess to check whether it is too high.

## Development

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The question card contains
Lock/Unlock, Next Question, and Random Question. Enter a new guess below it or
use Doubt Guess directly below the latest guess. Open Settings in the header
to switch themes or reset guesses immediately. Numerical answers stay hidden
during play. A challenge ends the round and reveals the answer, comparison,
and available reference information on a dedicated Result screen. Choose
Play another round to advance to the next question, then lock it to begin.

## Checks

```sh
npm run lint
npm test
npm run build
```

The 30 game-rule tests use Node's built-in test runner and need no additional
test dependency. Fredoka and Plus Jakarta Sans use `next/font/google`, which
requires Google Fonts to be reachable during a clean build.

## Code and behavior

- [Architecture, rules, verification, and limitations](docs/game-interface.md)
- [Design tokens and shared styles](docs/design-system.md)
- Rules and reducer: `src/features/game/game-rules.mjs`
- React state adapter: `src/features/game/useGame.js`
- Game UI: `src/components/Game` and its sibling components
- Question bank: `src/data/questions.json`

Player sessions, synchronization, scoring, and timed round progression are
not implemented. The UI makes no claims about players or network connections.
