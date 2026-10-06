# Split Bill: Design

A no-login web app for splitting a restaurant bill fairly.

## User flow
1. A user uploads a photo of a bill.
2. The backend parses it with an AI vision model into structured data: items (name, qty, unit price, line total), subtotal, tax, service charge, discount, total, currency.
3. The user reviews and edits the parsed bill in an editable table (fix names, prices, add/remove items, adjust tax/service).
4. The user adds payers (names) and assigns each item to one or more payers. An item assigned to several payers is split equally among them.
5. The app calculates what each payer owes and saves the bill. The user gets a shareable link `/b/<id>` that anyone can open without logging in to see the breakdown.

## Calculation rules
- Payer item subtotal = sum of their items; a shared item's line total is divided equally among the payers assigned to it.
- Tax, service charge, and discount are distributed proportionally to each payer's share of the item subtotal.
- Default currency IDR: amounts rounded to whole rupiah. Rounding remainder is assigned to the payer with the largest share so the payer totals always equal the bill total exactly.
- Every item must be assigned to at least one payer before the bill can be finalized.
- The calculation lives in a pure, framework-free function in `packages/shared` with thorough unit tests, so both API and web can use it.

## Architecture
Monorepo (pnpm workspaces, TypeScript):
- `apps/api`: Hono API, Prisma + Postgres. Owner: **Bruno (backend)**.
- `apps/web`: Nuxt (Vue 3) frontend. Owner: **Oliver (frontend)**.
- `packages/shared`: shared TypeScript types (API contract) and the split calculation.
- `docker-compose.yml` for local Postgres; basic GitHub Actions CI (install, typecheck, test, build).

## Data model (Prisma)
- **Bill**: id (short URL-safe id), currency, subtotal, tax, serviceCharge, discount, total, imageUrl (optional), createdAt, updatedAt.
- **Item**: id, billId, name, quantity, unitPrice, lineTotal.
- **Payer**: id, billId, name.
- **Assignment**: itemId, payerId (many-to-many between Item and Payer).

Money stored as integers in the smallest currency unit.

## API contract (JSON)
- `POST /bills/parse`: multipart image upload, returns a parsed draft bill (not saved): `{ currency, items[], subtotal, tax, serviceCharge, discount, total }`.
- `POST /bills`: body = bill + items + payers + assignments; validates, computes the split, saves, returns `{ id, ...bill, breakdown }`.
- `GET /bills/:id`: returns the saved bill with items, payers, assignments, and the per-payer breakdown.
- `PUT /bills/:id`: update a bill (edit items/payers/assignments) and recompute.

Per-payer breakdown shape: `{ payerId, name, items: [{ itemId, name, share }], subtotal, tax, serviceCharge, discount, total }`.

Request/response types are defined once in `packages/shared` and validated with zod on the API.

## Frontend screens
1. Upload: take or pick a photo, show parsing progress, handle parse errors (allow manual entry).
2. Review bill: editable items table and totals (tax, service, discount).
3. Payers & assignment: add payers, tick who had each item, live per-payer totals, warn on unassigned items.
4. Summary / share page (`/b/:id`): clean per-payer breakdown, copy-link button, mobile-first.

Mobile-first, IDR formatting (`Rp 12.500`), Indonesian and English UI text.
