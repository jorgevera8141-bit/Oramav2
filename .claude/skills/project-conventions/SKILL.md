---
name: project-conventions
description: orama-v2 (Café Rosinal POS) architecture, module pattern, staff/PIN auth, and Railway deploy conventions. Load this before writing or modifying backend/frontend code in this repo.
user-invocable: false
---

# orama-v2 conventions

Café Rosinal POS. Node >=26, Express 5, `pg` (raw SQL, no ORM), `zod` for validation. No build step, no framework on the frontend. Test runner is the built-in `node --test` (`npm test`).

## Backend module pattern

`src/modules/<name>/{routes,schemas,service}.js` — not every module has all three; only add `schemas.js`/`service.js` when there's real validation logic or pure business logic to separate out.

- Routes mounted in `src/app.js` under `/api`.
- `initDb()` in `src/app.js` runs all `CREATE TABLE IF NOT EXISTS` + `ALTER ... ADD COLUMN IF NOT EXISTS` on boot — there is no migration tool. Schema changes go there.
- Errors: `throw Object.assign(new Error(msg), { statusCode })`. The global handler in `app.js` logs and masks 500s.
- Validation goes through `src/middleware/validate.js`.
- Shared helpers live in `src/shared/`: `pin-auth.js`, `audit.js`, `dates.js`, `ntfy.js`, `notify.js`.

Current modules: `gastos`, `inventory`, `invoices`, `loyalty`, `menu`, `mesas`, `orders`, `promotions`, `reports`, `settings`, `social-posts`, `staff`, `uploads`.

## Frontend page pattern

Vanilla JS in `public/js/`, no bundler. `orama-finanzas.js` / `orama-promociones.js` are good templates to copy from:

- One `async function` per page, registered as `Orama.routes.<name>`.
- Shared helpers from `orama-core.js`: `api()`, `money`, `escapeHtml`, `pageHead()`.
- UI helpers from `orama-ui.js`: `Orama.toast`, `Orama.confirm`, `Orama.prompt`.
- One delegated listener on `#app`; the page function returns a cleanup closure.
- Router is `orama-router.js`.
- To add a new page: add a `<script defer>` tag to `public/index.html` before `orama-router.js`, plus a nav `<a data-route>` link.
- One stylesheet, `public/css/orama-pro.css` (dark espresso theme, CSS custom properties on `:root`).

## Staff / auth

No login system. `staff` table: `nombre`, `pin`, `tipo` (`staff` | `management`), `activo`. Sensitive actions are PIN-checked per call via `src/shared/pin-auth.js`, not session-based.

## Env vars

`.env` locally, Railway Variables in prod: `DATABASE_URL`, `PORT`, `FACTURAPI_KEY`, `NTFY_TOPIC_*`. AI assist uses either direct keys (`ANTHROPIC_API_KEY` + `FAL_KEY`) or a 9Router gateway (`NINEROUTER_URL` + `NINEROUTER_KEY`, which takes precedence when set). Optional: `ANTHROPIC_MODEL`, `FAL_IMAGE_MODEL`, `NINEROUTER_CHAT_MODEL`, `NINEROUTER_IMAGE_MODEL`, `AI_DAILY_LIMIT`.

`.env` holds live credentials — a project hook blocks Claude from editing it directly (see `.claude/settings.json`).

## Deploy

Railway, service `oramav2` in project `resilient-renewal`, builder RAILPACK, auto-deploy on push to `main` (repo `jorgevera8141-bit/Oramav2`). Prod URL `https://oramav2-production.up.railway.app`. DB is Railway Postgres. Local dev port comes from `.env` `PORT`.
