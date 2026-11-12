# No Way — interface styles

The interface uses warm surfaces, rounded cards, dark navy text, and indigo
interactions. Component layouts live in CSS Modules.

## Files

- `src/styles/tokens.css`: used colors, typography, spacing, radii, and motion.
- `src/app/globals.css`: reset, document defaults, headings, keyboard focus.
- `src/styles/primitives.css`: primary button and two state animations.
- `src/app/page.module.css`: centered page width.
- `src/app/layout.js`: Fredoka and Plus Jakarta Sans loaded with `next/font`.

## Colors and themes

| CSS token (`--color-` prefix) | Light | Dark |
| --- | --- | --- |
| `primary` | `#4338CA` | `#818CF8` |
| `on-primary` | `#FFFFFF` | `#0F172A` |
| `surface` | `#FAF8F5` | `#13111C` |
| `on-surface` | `#1E1B2E` | `#F8FAFC` |
| `surface-card` | `#FFFFFF` | `#1E1B2E` |
| `surface-dim` | `#F3EFEA` | `#2A263D` |
| `outline` | `#E2DCD5` | `#37324F` |
| `muted` | `#6B6776` | `#B5AFC6` |
| `accent` | `#A65000` | `#FFB65B` |
| `error-text` | `#BE1B22` | `#FF8B8B` |

The red brand mark uses `--color-brand: #DC2626`. Validation errors use the
separate error-text token for contrast. The game defaults to light mode.
The settings toggle switches the existing theme provider between light and dark using
`data-theme` on `html`; this preference is not persisted.

## Typography and layout

Fredoka is the display font; Plus Jakarta Sans is the body font. Heading
defaults and the body scale are defined globally, with component-specific
sizes in CSS Modules.

Mobile uses one column with 20px gutters and a 480px page maximum. At 700px
and above, the centered game shell is up to 1000px wide, with a full-width
question followed by two columns for the guessing flow and history.
Cards use a 1px outline, rounded corners, and a restrained shadow.

## Shared styles

`.button` provides the primary button, including hover, focus, pressed,
and disabled behavior. `button-secondary` gives question navigation neutral
styling, `button-danger` marks destructive or challenge entry points, and
`button-challenge` gives the contextual Doubt Guess control a solid red fill.
Buttons have a 44px minimum touch target; component styles adjust spacing and
shape. Question controls use a subtle card footer toolbar. The theme toggle and
reset button live in the compact Game settings dropdown in the header.
The latest guess and its Doubt button are stacked vertically.

`.surface-enter` animates question changes. `.number-pulse` marks a new
highest guess. Reduced-motion preferences suppress these animations,
transitions, and pressed movement.

`GameResult` uses a centered 760px content width within the existing shell.
The outcome hero uses an indigo check for a successful challenge and an amber
cross for a failed challenge. Labeled comparison cards use large tabular
numerals; the correct answer uses the existing indigo surface tint. Cards sit
side by side and stack below 360px. Reference information stays secondary,
and the primary next-round button is full-width on mobile. The result enters
over 240ms with a 70ms comparison delay; reduced motion removes both animations.

Forms, cards, empty states, validation, and status labels use their component
CSS Modules. There are no unused opt-in card, field, tag, or typography classes.
