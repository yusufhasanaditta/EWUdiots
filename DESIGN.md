# EWUdiots — DESIGN.md

The design system for the EWUdiots app (student side and EWUdiots Club). Coding agents read this before touching any UI.
Tokens live in `app/src/styles.css` (`:root`, student side) and `app/src/clubs/clubs-v2.css` (`body[data-mode="club"]`);
use the token names below, never raw hex in components.

## 1. Visual theme

Clean, flat, friendly, dense enough for a phone. White cards on a pale cool background, one strong violet brand colour,
a lime accent for the "Club" pill, tinted status pills. **Flat colour only** — no gradient backgrounds, no gradient
text, no glow blobs. Depth comes from 1px borders and soft shadows, not colour ramps. Unofficial student project: never
use EWU's logo, crest or colours, and keep "Unofficial · not affiliated with EWU" visible in headers.

## 2. Colour

| Role | Student side | Club side | Use |
|---|---|---|---|
| `--primary` | `#7c3aed` | `#4318ff` royal indigo | buttons, links, active tab, focus ring |
| `--primary-d` | `#5b21b6` | `#2f0fd1` | pressed / hover on primary |
| `--primary-l` | `#ede9fe` | `#e9e5ff` | tinted backgrounds, selected chips |
| `--grad` | `#7c3aed` (flat) | `#4318ff` (flat) | legacy name, now one flat colour |
| `--cl-hero` | — | `#23198f` deep indigo | club hero, banners, applicant and election headers (flat) |
| Heading ink | `--text` `#0f172a` | `--cl-title` `#1f1a9e` navy-blue | page and section titles; sub-lines `--text-3` `#6763b5` lavender |
| `--text-2` / `--text-3` | `#475569` / `#64748b` | same | body / secondary text |
| `--bg` / `--surface` | `#f8fafc` / `#fff` | `#f7f7fc` / `#fff` | page / cards |
| `--border` | `#e5e7eb` | same | 1px card borders |
| `--lime` | `#a3e635` | same | "Club" pill and highlights, with `--lime-ink` text |
| Status | success `#22c55e`, warning `#f59e0b`, error `#ef4444`, info `#3b82f6` | | always with an icon + label, never colour alone |
| Charts | `--viz-1…5` | | validated with the dataviz palette checker, fixed order |

White text only on colours with ≥ 4.5:1 contrast (`#7c3aed`, `#4318ff`, `#23198f`, `#1f1a9e` all pass; `#8b5cf6` does not).
Dark mode redefines every token under `:root[data-theme="dark"]`; never flip colours automatically.

## 3. Typography

Inter (system-ui fallback), body 15px / 1.5. Page title 22–32px (`clamp`), weight 800, tight tracking (-.02em).
Section heading 17–20px / 700. Labels 12–13px / 600. Numbers in stats use `tabular-nums`. Headings use
`text-wrap: balance`. Two families at most (Inter, plus Caveat only for the hand-written "scribble" accent).

## 4. Spacing, radius, elevation

4px grid: 4 · 8 · 12 · 16 · 24. Radius `--r8` inputs, `--r12` small cards, `--r16` cards, `--r24` heroes, `999px` pills.
Shadows `--sh-sm` (rest), `--sh-md` (cards), `--sh-lg` (sheets), `--sh-xl` (modals). One radius per nesting level.

## 5. Components

- **Page header** (`ui.ph`, `.cl-ph`): title + one-line subtitle left, at most one primary action right.
- **Stat tiles** (`ui.stat`, `.cl-stats`): icon tile, big number, small label; one row of 4–5.
- **Icon tile** (`.itile.<tone>`): tinted square + coloured SVG icon. Tones: purple, blue, green, orange, red, teal, pink, amber.
- **Status pill** (`ui.st([label, tone])`): tinted background, dark tone text, optional icon.
- **Segmented tabs** (`ui.seg`, `.cl-seg`): solid primary for the selected tab.
- **Lists**: rows with avatar/icon, two text lines, trailing value or chevron; whole row is the link.
- **Sheets/modals**: `openModal` with `modalHead(title)`; close button labelled; confirm before destructive actions.

## 6. Motion

150–300ms, ease-out on enter, transform/opacity only, every animation off under `prefers-reduced-motion`.

## 7. Do / don't

- Do: SVG icons from the icon set (Phosphor), never emoji as icons. Real data or honest empty states.
- Do: 44×44px touch targets on phones (icon buttons get an invisible 44px hit area), visible focus rings.
- Do: loading state on every async button (`ctx.busy(btn, true)`), text ends with "…".
- Don't: gradients, gradient text, glow blobs, purple-to-blue headline effects, centred walls of text.
- Don't: disable zoom, block paste, `transition: all`, or `outline: none` without a focus replacement.
- Don't: more than one primary button per screen section.

## Club tiles and tabs (v2.26)

- Quick-action tiles are pastel-filled cards with a **solid** icon in the tile's colour (no inner icon square).
- Pill tabs: chosen = solid `--primary` with white text; others = lavender `--cl-soft` with ink text.
- Club overrides live in `v226.css` under `body[data-mode="club"][data-mode]`: the club CSS loads later (lazy chunk),
  so the extra attribute keeps release rules ahead of it.
