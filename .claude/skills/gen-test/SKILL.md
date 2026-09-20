---
name: gen-test
description: Scaffold a node:test file for an orama-v2 backend module, following the project's existing schema/service test conventions. Invoke as /gen-test <module-name>.
---

# gen-test

Generates `test/<module>.<kind>.test.js` for an orama-v2 backend module, matching the style already used by the 5 modules with coverage (`invoices`, `loyalty`, `orders`, `promotions`, `social-posts`).

As of the last audit, these 8 modules have **zero** test coverage: `gastos`, `inventory`, `menu`, `mesas`, `reports`, `settings`, `staff`, `uploads`.

## Workflow

1. **Read the target module** — `src/modules/<name>/` — and identify what's actually unit-testable:
   - `schemas.js` exports (zod schemas) → always testable via `safeParse`, no DB/network needed.
   - `service.js` / other files exporting **pure functions** (no `pool.query`, no `req`/`res`) → directly testable.
   - Route handlers in `routes.js` that touch `pool.query` or `req`/`res` directly are **not** unit-testable with the current stack (no supertest/integration harness in this project). Skip them — don't invent a DB mock. If a module has only a `routes.js` with all logic inline, say so and either (a) suggest extracting the pure logic into a `service.js` first, or (b) skip that module and tell the user why.

2. **Match the existing style** exactly — two references already in the repo:
   - Schema tests: `test/loyalty.schemas.test.js` — one `test()` per validation rule, `assert.equal(schema.safeParse(input).success, true/false)`, Spanish field names preserved as-is.
   - Pure-function/service tests: `test/orders.service.test.js` — one `test()` per behavior, `assert.deepEqual`/`assert.equal` on the return value, no mocking framework (plain `node:assert/strict`).

3. **File naming**: `test/<module>.schemas.test.js` and/or `test/<module>.service.test.js`, matching the source file it covers.

4. **Imports**: `require('node:test')`, `require('node:assert/strict')`, then `require('../src/modules/<module>/<file>')` — CommonJS, matching every existing test file.

5. **Run `npm test` after writing** and confirm the new tests pass, plus that the full suite (currently 137 tests) still passes — don't leave a red suite.

## Known shapes per untested module (from the last audit — re-check before relying on this, code may have moved on)

- `gastos/schemas.js`: `createGastoSchema` (enum `categoria`, positive `monto`, `fecha` as `YYYY-MM-DD` string), `GASTO_CATEGORIAS` array.
- `settings/schemas.js`: `updateSettingSchema`.
- `uploads/process.js`: `processImageToJpeg` (pure image-processing function, `sharp`-based), plus `UPLOAD_DIR`, `MAX_DIMENSION`, `JPEG_QUALITY` constants.
- `inventory/schemas.js`: has schemas — read the file for exact shape.
- `menu`, `mesas`, `reports`, `staff`: only have `routes.js` today (no `schemas.js`/`service.js`) — check per step 1 whether there's anything pure to extract before assuming these are untestable as-is.

## Scope

One module per invocation (e.g. `/gen-test gastos`). Don't try to scaffold all 8 in one pass — review and run tests after each one.
