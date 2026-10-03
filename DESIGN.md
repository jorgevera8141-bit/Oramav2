# Orama Café POS: design system

What the app actually uses today, written down so new screens stop drifting. Source of truth is `public/css/orama-pro.css` (`:root` tokens at the top). The look is a dark espresso theme over a coffee-bean photograph, with teal as the single action colour and amber for attention.

## Colour (CSS variables)
| Token | Value | Use |
|---|---|---|
| `--base` | #0F0D0B | page and input background |
| `--surface` / `--elevated` | #1A1614 / #252019 | cards, panels |
| `--espresso` | #3D2B1F | borders, quiet fills |
| `--cream` | #E8E0D4 | primary text |
| `--muted` | #A89F91 | secondary text (about 7:1 on `--base`) |
| `--teal` / `--teal-soft` | #2A9D8F / 20% | primary actions, links, available state |
| `--amber` | #D4A84B | attention, occupied, urgent (10+ min) |
| `--terracotta` | #C97064 | destructive actions and errors |
| `--danger` / `--success` | alias of terracotta / teal | for inline error and success states |

## Type
- **Playfair Display** for titles and card names; **DM Sans** for body and buttons; **JetBrains Mono** (`--mono`) for numbers, labels and eyebrows.
- Never below **12px** (table headers and eyebrows are 12px). Body 16px. Page title `clamp(28px, 4vw, 42px)`.

## Spacing
`--space-1..6` = 4, 8, 12, 16, 24, 32px. Use them in new code. Older rules still carry ad hoc values (9, 10, 14, 18, 22px); replace them when you touch the rule rather than in a mass rewrite.

## Components
- **Buttons.** Default `.button` is an outline. `.button.primary` (and Cobrar, and the bar's Listo) is solid teal: one per card or view. `.button.danger` is a rose tint at rest and fills on hover: use it for anything that deletes, cancels or removes. Minimum height 44px.
- **Cards and panels.** `.glass-card` for KPIs, `.panel` for sections, `.order-card` for an order. A card earns its place by being the thing you act on.
- **Tables.** `table.stack-table` with a `data-label` on each cell turns into one card per row under 768px, so actions are never clipped.
- **Modals.** `.orama-modal` with `role="dialog"` and `aria-modal`; `orama-ui.js` names it from its first `.orama-modal-message`. Set `aria-label` yourself if the first line is not a title.
- **Page heads.** `pageHead(eyebrow, title, subtitle, photo, action)`; pass an `action` (for example "Nueva orden") for the screen's one primary action.

## Rules
1. The page background photo sits behind headings, so headings carry a soft text shadow; do not put small text directly on the photo.
2. One primary action per view. Destructive actions never look like neutral ones.
3. Touch targets 44px; interactive elements must work from the keyboard and keep the focus ring.
4. Motion is state feedback (toasts, stamps, cart toggle) plus the ambient background orbs; everything stops under `prefers-reduced-motion`.
5. Business days run on Mexico City time: use `businessDate()` in the browser and the timezone helpers on the server, never `toISOString()` for "today".
6. Revenue is money earned. Comps (cortesía, canje, comped split share) are reported as Cortesías, never as sales.
