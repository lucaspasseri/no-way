# No Way — Party Trivia System

Extracted from the supplied design brief: a punchy social trivia game with warm
surfaces, tactile cards, organic pills, and expressive numbers. Players raise
numerical guesses or call “NO WAY!” when a guess goes too far.

## Files

- `src/styles/tokens.css`: palettes, typography scale, spacing, shape, depth, motion.
- `src/app/globals.css`: reset, document defaults, typography, keyboard focus.
- `src/styles/primitives.css`: opt-in cards, buttons, fields, tags, animations.
- `src/app/page.module.css`: the current page's centered card layout.
- `src/app/layout.js`: Fredoka and Plus Jakarta Sans loaded with `next/font`.

## Palette

| CSS token (`--color-` prefix) | Light | Dark |
| --- | --- | --- |
| `primary` | `#4338CA` | `#818CF8` |
| `on-primary` | `#FFFFFF` | `#0F172A` |
| `surface` | `#FAF8F5` | `#13111C` |
| `on-surface` | `#1E1B2E` | `#F8FAFC` |
| `surface-card` | `#FFFFFF` | `#1E1B2E` |
| `on-surface-card` | `#1E1B2E` | `#F8FAFC` |
| `surface-dim` | `#F3EFEA` | `#2A263D` |
| `outline` | `#E2DCD5` | `#37324F` |

Shared tokens: `accent` = `#D97706`, `sunshine` = `#F59E0B`, `doubt` = `#DC2626`,
`on-doubt` = `#FFFFFF`, `correct` = `#059669`, `on-correct` = `#1C1C1C`.
The brief names both amber values; the structured accent is preserved, and
sunshine is used for active-turn tags and highlighted buttons. Use colors as
background/foreground pairs, rather than assuming every token is readable text
on every surface. Always label verdicts so color is not their only meaning.

The default theme follows the OS. Set `data-theme="light"` or `data-theme="dark"`
on `<html>` to override it. Remove the attribute to follow the OS again. This
setup does not add a theme switch or persistence.

## Typography

All values below are design pixels at the default 16px root size; CSS uses rem.
Desktop heading sizes apply at a 480px viewport and above (an implementation
choice; the brief only specifies mobile and desktop sizes).

| Class | Font | Weight | Mobile size / line | Desktop size / line |
| --- | --- | --- | --- | --- |
| `display-lg` / `h1` | Fredoka | 700 | 32 / 38 | 40 / 48 |
| `headline-lg` / `h2` | Fredoka | 600 | 24 / 30 | 28 / 36 |
| `headline-md` / `h3` | Fredoka | 600 | 18 / 24 | 20 / 26 |
| `body-lg` | Plus Jakarta Sans | 400 | 17 / 26 | 17 / 26 |
| `body-md` (body default) | Plus Jakarta Sans | 400 | 15 / 22 | 15 / 22 |
| `label-lg` | Plus Jakarta Sans | 600 | 14 / 20 | 14 / 20 |
| `label-sm` | Plus Jakarta Sans | 600 | 12 / 16 | 12 / 16 |

Display tracking is -0.25px on mobile and -0.5px on desktop.
Use `number-display` for Fredoka and tabular number spacing. Choose heading tags
by document hierarchy; typography classes can style any appropriate element.

## Spacing, shape, and motion

- Mobile reference width: 390px; fluid content with a 440px maximum and 20px gutters.
- `--space-xs/sm/md/lg/xl`: 4 / 8 / 16 / 24 / 32px (8px rhythm, 4px half-step).
- `--radius-sm/default/md/lg/full`: 8 / 14 / 18 / 24 / 9999px.
- Cards: 1.5px outline; `--shadow-card` preserves both ambient shadows from the brief.
- Buttons: pill shape and a 2px darker bottom border; 44px minimum height.
- State transitions: 120ms ease-out; entry: 240ms cubic-bezier(0.2, 0, 0.1, 1).
- `surface-enter`, `number-pulse`, `doubt-shake` are opt-in animation classes.
  Replay them when the relevant state changes. Number counting needs game logic.
- Reduced-motion preferences remove the animations, press movement, and transitions.

## Usage

Global styles are loaded once by the root layout. Reference tokens inside CSS
Modules for component-specific layout, or compose the shared classes:

```jsx
<section className="card card-elevated" aria-labelledby="guess-title">
  <span className="tag tag-turn">Your turn</span>
  <h2 id="guess-title">How high will you go?</h2>
  <label className="field" htmlFor="guess">
    <span className="field-label">Your guess in feet</span>
    <input className="input" id="guess" name="guess" type="number" />
  </label>
  <button className="button" type="submit">Submit Guess</button>
  <button className="button button-doubt" type="button">NO WAY!</button>
</section>
```

Place submit controls inside a form with its own handler. Give icon-only buttons
(`button button-icon`) an accessible label. Fields support `disabled` and
`aria-invalid="true"`; associate help/error text with `aria-describedby`.
The primary button uses `button` alone; modifiers include `button-doubt` and
`button-accent`. Tags use `tag`, optionally with `tag-turn`, `tag-doubt`, or
`tag-correct`. Layout and event handlers belong to the consuming component.

The brief references `components/button.html`, `card.html`, and `input-field.html`.
Those sticker sheets were not provided. These primitives interpret the written
specification; they do not reproduce unavailable canonical markup or variants.

## Voice

Spirited, witty, inviting, and competitive. Prefer action labels such as “Doubt
Guess”, “Submit Guess”, “Reveal Answer”, and “Next Round”. Show units and verdict
deltas explicitly, for example “+12 higher than the real answer”.
