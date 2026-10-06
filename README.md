# split-bill

No-login split-bill app. Upload a photo of a restaurant bill, edit the parsed items, assign them to payers, and share a link at `/b/<id>`.

Currency is IDR. Amounts are whole rupiah. Shared items are split equally. Tax, service charge, discount, and rounding follow each payer's share of the item subtotal. Rounding leftovers go to the payer with the largest share so the payer totals match the bill total.

`rounding` is an optional whole-rupiah pembulatan on create, update, and the parsed draft. It may be negative, and it defaults to 0 when omitted, so older clients keep working. The bill total is subtotal + tax + service charge − discount + rounding. Each payer's breakdown includes their `rounding` share.

## Layout

pnpm workspace:

- `packages/shared` — zod API contract and the split calculation. Owned with the API.
- `apps/api` — Hono API, Prisma, Postgres.
- `apps/web` — Nuxt frontend on port 3000. The workspace includes `apps/*`, so it installs with the rest.

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

`ApiError` may include an optional `code`. Parse failures use `vision_unavailable` when parsing cannot run right now: no key, rejected credentials, quota, the provider's own rate limit, a timeout, a network error, a provider 5xx, an unknown or inaccessible model (`model_not_found`), or an unsupported request parameter such as `response_format`. `vision_unreadable` is only when the image itself is the problem: the provider rejects the image, the model returns empty or invalid JSON, or the draft fails normalization (HTTP 422). The `error` string stays generic. Provider failures are HTTP 502, so they are separate from the per-IP HTTP 429, which has no `code`. Older clients can ignore `code`.

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

One `.env` at the repo root is enough for every root and API script: `pnpm db:deploy`, `pnpm db:migrate` (create a migration while developing), `pnpm db:generate`, `pnpm db:studio`, `pnpm dev`, and the built server (`node apps/api/dist/index.js`).

Variables already set in the environment win, which is what production and CI use. Otherwise `apps/api/.env` wins over the repo-root `.env`, and the root file fills anything still unset. Prisma loads those same files from `apps/api/prisma.config.ts`, so it sees `DATABASE_URL` in the root `.env` when you run `pnpm db:deploy` from the repo root.

On startup the API logs one line: port, CORS origins, whether a vision key is set (`yes` or `no`), the model, and which `.env` files were loaded. When more than one file is listed, the first one wins, so an old `apps/api/.env` overriding the root file shows up there. The line does not include secrets.

`pnpm typecheck`, `pnpm test`, and `pnpm build` run across the workspace.

Start the website on port 3000 (the API's default CORS origin):

```sh
pnpm --filter @split-bill/web dev
```

`pnpm dev` for the web app uses the in-browser mock when `NUXT_PUBLIC_USE_MOCK_API` is unset. The built app defaults to the real API at `http://localhost:3001` (`NUXT_PUBLIC_API_BASE_URL`); set `NUXT_PUBLIC_USE_MOCK_API=false` to do that from the dev server too. See `apps/web/README.md`.

Every variable is listed in `.env.example`. `pnpm install` builds `@split-bill/shared`, which is what the API and the web app import.

Photo parsing calls OpenAI (`gpt-4o` by default, override with `OPENAI_MODEL`). The rest of the API runs without a key; `POST /bills/parse` returns 503 until `OPENAI_API_KEY` is set. Tests mock that call.

`POST /bills/parse` is limited per client IP. The default is 10 requests per 60 seconds (`PARSE_RATE_LIMIT_MAX` and `PARSE_RATE_LIMIT_WINDOW_SECONDS`). The counter is stored in memory inside this process, so a restart clears it and each API instance keeps its own count. A limited request returns 429 `{ "error": "Too many parse requests" }` and a `Retry-After` header. Forwarded IP headers are ignored unless `TRUST_PROXY=true`. Turn that on only when the reverse proxy overwrites `X-Forwarded-For` or `X-Real-IP`; otherwise a client can spoof those headers and dodge the limit.

## Env vars

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API port, default `3001` |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated. Default `http://localhost:3000` |
| `OPENAI_API_KEY` | Vision API key for bill photos |
| `OPENAI_MODEL` | Vision model, default `gpt-4o` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `PARSE_RATE_LIMIT_MAX` | Parse requests allowed per IP per window, default `10` |
| `PARSE_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window length, default `60` |
| `TRUST_PROXY` | When `true`, use `X-Forwarded-For` or `X-Real-IP` for the parse limit. Default `false` |
