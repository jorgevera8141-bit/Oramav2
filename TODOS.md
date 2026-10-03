# TODOS

## Design debt (from the login plan design review, 2026-10-01)

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
