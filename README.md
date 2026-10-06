# split-bill

No-login split-bill app. Upload a photo of a restaurant bill, edit the parsed items, assign them to payers, and share a link at `/b/<id>`.

Currency is IDR. Amounts are whole rupiah. Shared items are split equally. Tax, service charge, and discount follow each payer's share of the item subtotal. Rounding leftovers go to the payer with the largest share so the payer totals match the bill total.

## Layout

pnpm workspace:

- `packages/shared` — zod API contract and the split calculation. Owned with the API.
- `apps/api` — Hono API, Prisma, Postgres.
- `apps/web` — Nuxt app. Not part of this package; the workspace already includes `apps/*`.

Import the contract from `@split-bill/shared`:

```ts
import {
  billWriteSchema,
  calculateSplit,
  parsedBillDraftSchema,
  type BillResponse,
} from "@split-bill/shared";
```

`POST /bills/parse` reads a multipart image in the field `image` (`PARSE_IMAGE_FIELD_NAME`). Saving a bill uses `billWriteSchema`. Responses use `billResponseSchema`, including a per-payer `breakdown`.

## Running locally

1. Start Postgres:

   ```sh
   docker compose up -d
   ```

2. Copy the env file and fill in `OPENAI_API_KEY` if you want photo parsing:

   ```sh
   cp .env.example .env
   ```

3. Install, migrate, and start the API (port 3001):

   ```sh
   pnpm install
   pnpm db:deploy
   pnpm dev
   ```

`pnpm db:migrate` creates a new migration during development. `pnpm typecheck`, `pnpm test`, and `pnpm build` run across the workspace.

The API reads `apps/api/.env` first, then fills any missing variables from the repo-root `.env`. Every variable is listed in `.env.example`. `pnpm install` builds `@split-bill/shared`, which is what the API and the web app import.

Photo parsing calls OpenAI (`gpt-4o` by default, override with `OPENAI_MODEL`). The rest of the API runs without a key; `POST /bills/parse` returns 503 until `OPENAI_API_KEY` is set. Tests mock that call.

## Env vars

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API port, default `3001` |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated. Default `http://localhost:3000` |
| `OPENAI_API_KEY` | Vision API key for bill photos |
| `OPENAI_MODEL` | Vision model, default `gpt-4o` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL |
