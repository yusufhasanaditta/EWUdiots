# EWUdiots — DESIGN.md (v3, "premium")

The design system for the EWUdiots app (student side and EWUdiots Club). Coding agents read this before touching any UI.
It comes from the founder's own boards in `UI Design/` (never committed) plus the motion of the Language Hub project.
Tokens live in `app/src/styles.css` (`:root`), motion and depth in `app/src/fx.css` + `app/src/motion.js`, the premium
layer in `app/src/v227.css`, club tokens in `app/src/clubs/clubs-v2.css`. Use token names, never raw hex in components.

## 1. Visual theme

Premium, playful, student-first: *"More than a university. A vibe."* A soft lavender-white canvas, white cards,
one strong violet brand colour with cyan and lime as partners. Hero surfaces are deep navy-to-indigo with slow
aurora blobs (violet, cyan, lime). Depth comes from layered soft shadows, coloured glow under primary actions, and real
3D (perspective, tilt, coverflow) on the few things worth touching. Personality comes from the purple-hoodie mascot,
hand-written Caveat notes with a lime swoosh, and colourful course strips.
Unofficial student project: never use EWU's logo, crest or colours; keep "Unofficial · not affiliated with EWU" visible.

## 2. Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Primary | `--primary` / `-d` / `-l` / `-ll` | `#7c3aed` / `#5b21b6` / `#ede9fe` / `#f5f3ff` | buttons, links, active state, focus ring |
| Secondary | `--secondary` | `#06b6d4` cyan | second series, info highlights, aurora |
| Accent | `--accent` (`--lime`) | `#a3e635` | swooshes, "Club" pill, celebratory marks (dark ink on it, never white) |
| Canvas / card | `--bg` / `--surface` | `#f8fafc` / `#fff` | page / cards |
| Ink | `--text` / `-2` / `-3` | `#0f172a` / `#475569` / `#64748b` | headings / body / secondary |
| Border | `--border` | `#e5e7eb` | 1px card borders |
| Status | success `#22c55e`, error `#ef4444`, warning `#f59e0b`, info `#3b82f6` | | always icon + label, never colour alone |
| Course strips | `--c1…c7` via `ctx.colorFor(code)` | | left edge of course cards, routine blocks |

### Gradients (allowed, with rules)

| Token | Value | Use |
|---|---|---|
| `--grad` (`--grad-brand`) | `linear-gradient(135deg, #8b5cf6, #7c3aed 45%, #5b21b6)` | primary buttons, selected tabs, progress fills, the FAB |
| `--grad-hero` | navy `#0f172a` → indigo `#23198f`, with aurora blobs | hero cards (degree, CGPA, next class, semester carousel) |
| `--grad-soft` | `#f5f3ff` → `#ecfeff` | quiet highlighted panels |
| `--grad-ring` | conic violet → cyan | progress rings |

- Gradients go on **surfaces only**: never gradient text, never behind paragraphs of reading text.
- White text only on gradients whose lightest stop still has ≥ 4.5:1 contrast (all tokens above pass).
- Glow (`--glow`) only under the one primary action of a section and on hero cards; never on lists.
- Aurora blobs (`.fluid`, three blurred circles) only inside hero surfaces, clipped to the card, at most one per screen
  section, and frozen under reduced motion.
- Dark mode redefines every token under `:root[data-theme="dark"]`; never flip colours automatically.

## 3. Typography

Inter (system-ui fallback), body 15px / 1.5. Page title 22–32px (`clamp`), weight 800, tracking -.02em. Section heading
17–20px / 700. Labels 12–13px / 600. Numbers use `tabular-nums`; headings `text-wrap: balance`. Caveat only for the
hand-written notes ("Plan smart, study happy!"), always paired with the lime swoosh. Two families at most.

## 4. Spacing, radius, elevation, depth

4px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48. Radius `--r8` inputs, `--r12` small cards, `--r16` cards, `--r24` heroes and
sheets, `999px` pills. Shadows `--sh-sm` rest, `--sh-md` cards, `--sh-lg` sheets, `--sh-xl` modals, `--glow` primary.
3D: `perspective: 1000px`; tilt at most 12° (pointer on desktop, finger drag on phones); coverflow cards rotate ±28°
and scale to .88 away from the centre. One radius per nesting level.

## 5. Components

- **Page header** (`ctx.head`): title + one-line subtitle left, at most one primary action right.
- **Hero card** (`.deg-hero`, `.cgpa-card`, `.next-card`, `.sem-hero`): `--grad-hero` + aurora + white text, tilts.
- **Segmented tabs** (`ctx.seg`): pills; a gradient thumb **slides** to the chosen tab (springs, never jumps).
- **Bottom tab bar** (phones): floating, centre FAB; a tinted pill slides under the active tab.
- **Icon tile** (`.itile.<tone>`): tinted square + coloured SVG icon. Tones: purple, blue, green, orange, red, teal, pink, amber.
- **Status pill**: tinted background, dark tone text, optional icon.
- **Course card** (`.ccard`): colour strip on the left (`--cc`), code bold, title, meta row with icons.
- **Semester carousel** (`.sem-car`): swipe through 12 semesters in 3D coverflow; the centre card says done / now / next.
- **Refund timeline** (`.drop-line`): the calendar's refund steps as a track, today's marker on it, the step in force lit.
- **Sheets/modals**: `openModal` + `modalHead(title)`; close button labelled; confirm before destructive actions.
- **Mascot + note**: empty states and celebrations use the mascot images in `/img/mascot-*.webp` with a Caveat note.

## 6. Motion (from Language Hub)

Curves: `--out` `cubic-bezier(.16,1,.3,1)` for entrances, `--spring` (linear() spring) for presses and indicators,
`--spring-soft` for sheets. Durations: presses 120ms, indicators 450ms, entrances 550–700ms, ambient 12–26s.
Animate `transform` and `opacity` only (blobs may also blur). Everything stops under `prefers-reduced-motion`.

| Pattern | Where | How |
|---|---|---|
| Screen morph | every navigation | View Transitions: old drifts up, new rises in |
| Rise in | first screenful | `.fx-rise`, staggered 45ms, capped at 6 items |
| Reveal on scroll | below the fold | `motion.js` marks `.rv`; slides up 24px + fades once, stagger 60ms |
| Sliding indicator | `.seg`, bottom bar, sidebar | thumb animates from the old tab to the new one (FLIP) |
| Press | buttons, tiles, chips | scale .95–.97 on press, spring back |
| Tilt | hero cards | `[data-tilt]`: follows pointer; phones get one "hello" tilt |
| Coverflow | semester carousel | scroll-snap; rotateY/scale/opacity from distance to centre |
| Stamp | done / dropped badges | scale 2.4 → .92 → 1 with spring |
| Shake | form errors | ±5px twice, 400ms |
| Count up | big numbers | 0 → value in 700ms on first view |
| Aurora | hero surfaces | blobs drift 18–26s, alternate |
| Tide | class in progress, focus timer, website QR card | `tide.ts`: liquid rises with time (`--fill`), two waves, bubbles |
| Start clock | next class within 24 h | `tide.ts`: live hands, arc closes over the last hour, start-minute dot; card breathes in the last 5 min |
| Bar grow | every `.bar` | fill grows from 0, one light sweep |
| Flicker / pop | streak flame, ticked boxes | flame flickers; checkbox pops on tick |

## 7. Do / don't

- Do: SVG icons from the icon set (Phosphor), never emoji as icons. Real data or honest empty states.
- Do: 44×44px touch targets on phones, 24×24px anywhere; visible `:focus-visible` rings.
- Do: busy state on every async button (`ctx.busy(btn, true)`), loading text ends with "…".
- Do: gradients, glow, blobs and 3D where section 2 and 6 allow them — premium, not noisy.
- Don't: gradient text, purple-to-blue headline effects, glow on every card, blobs behind reading text.
- Don't: disable zoom, block paste, `transition: all`, or `outline: none` without a focus replacement.
- Don't: more than one primary button per screen section.

## Club tiles and tabs (v2.26)

- Quick-action tiles are pastel-filled cards with a **solid** icon in the tile's colour (no inner icon square).
- Pill tabs: chosen = solid `--primary` with white text; others = lavender `--cl-soft` with ink text.
- Club overrides live in `v226.css` under `body[data-mode="club"][data-mode]`: the club CSS loads later (lazy chunk),
  so the extra attribute keeps release rules ahead of it.
