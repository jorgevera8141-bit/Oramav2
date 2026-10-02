# TODOS

## Design debt (from the login plan design review, 2026-10-01)

### Write a real DESIGN.md
- **What:** Write a DESIGN.md that captures the app's actual design system: the espresso palette (`--base #0F0D0B`, `--surface #1A1614`, `--elevated #252019`, `--cream`, `--muted`, `--teal`, `--amber`, `--terracotta`), Playfair Display / DM Sans / JetBrains Mono, and the component vocabulary (`.glass-card`, `.pill`, `.orama-overlay`, toasts, `.badge`).
- **Why:** There is no DESIGN.md, and `docs/DESIGN.reference.md` describes a Vercel-style look the app does not use. The login review had to read tokens out of `orama-pro.css` by hand, and every future design review will too.
- **Pros:** One source for design reviews; new screens stop drifting.
- **Cons:** About an hour of work and one more file to keep current.
- **Context:** `/design-consultation` writes it. Nothing depends on it; the login plan already names every token it needs.
- **Depends on / blocked by:** nothing.

### Generate visual mockups of the login flow
- **What:** Once the gstack designer has an OpenAI key, generate mockups of the login tiles, the keypad, the lock/expiry overlay and the bar display banner, and look at them before building.
- **Why:** The designer was not set up (no OpenAI API key), so the login review was text-only. Sizes and spacing are specified, but nobody has seen the screens.
- **Pros:** Catches layout and proportion problems before code.
- **Cons:** Needs an OpenAI key and a few minutes of setup.
- **Context:** Run `$D setup` (or set `OPENAI_API_KEY`), then re-run `/plan-design-review`. Nothing blocks the build in the meantime.
- **Depends on / blocked by:** an OpenAI API key.

### "Cambiar mi PIN" screen
- **What:** A self-service screen where a signed-in person changes their own six-digit PIN (old PIN, new PIN twice).
- **Why:** The login plan makes every PIN six digits and sets or resets them with `npm run set-pin`. A staff member who thinks their PIN was seen has to find the owner at a terminal.
- **Pros:** Staff can rotate their own PIN; the owner stops being the bottleneck for resets.
- **Cons:** A new screen with its own states, and a second place the six-digit rule must be enforced.
- **Context:** Deliberately left out of the login work to keep it small.
- **Depends on / blocked by:** the login work shipping first.

## Design debt (from /design-review, 2026-10-02)

### Dashboard open-orders table clips its action column on phones
- **What:** On a 375px screen the "Órdenes abiertas" table scrolls sideways and the Efectivo / Tarjeta / Cancelar column is off-screen; the estado pill is cut at the right edge.
- **Why:** The table keeps `min-width:600px` inside an `overflow-x:auto` wrapper with no cue that it scrolls. Caja handles phones well, so this only hurts the dashboard.
- **Context:** Make the rows stack as cards under 768px, or drop the actions from the dashboard table and link to Caja.

### Modals have no dialog semantics; the cart summary has no keyboard access
- **What:** Every modal is `<div class="orama-modal" role="none" aria-modal="true">` (orama-app.js:51, orama-cashier.js:51, 212, 388 and others); it should be `role="dialog"` with `aria-labelledby`. The cart summary (`orama-cart.js:28`, `data-cart-toggle`) is a clickable `div` with no `role="button"`, `tabindex` or `aria-expanded`.
- **Why:** Screen readers do not announce the PIN and payment dialogs, and the cart cannot be opened from the keyboard. Found by Codex; verified in the source.
- **Context:** JS changes to live cashier flows, so test the PIN, cobro and split-payment dialogs after.

### Spacing and type scale tokens
- **What:** `:root` only defines colour, easing and shadow. Spacing uses ad hoc values (9, 10, 14, 18, 22px) and about 70 raw `rgba(` literals; `var(--mono)` is used but never defined; `.button.small` has no CSS.
- **Why:** Found by the Claude subagent and Codex. Not user-visible today, but each new screen drifts.
- **Context:** Pair with writing the real DESIGN.md above.

### Polish items
- Nueva orden: occupied tables look as selectable as free ones. Clarify what a tap on an occupied table does.
- Menu category chips mix photo and plain styles, and the "Tes" chip is cramped.
- On phones the nav hides "Más" off-screen (a fade hints at scrolling).
- The drifting background orbs and loyalty reward sparks are ornamental motion; inventory's empty state is a bare "Sin inventario"; the loyalty card logo looks soft.
