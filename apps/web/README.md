# BagiNota (`apps/web`)

Nuxt frontend for the split-bill app. Upload a bill photo, check the parsed items, tick who had each one, and open a shareable summary at `/b/<id>`.

UI copy is Indonesian and English. Money is shown as `Rp 12.500` (whole rupiah, `.` thousands separator).

## Run

From the repo root (this package is part of the pnpm workspace):

```bash
pnpm install
pnpm --filter @split-bill/web dev
```

The app is served at http://localhost:3000. The dev server stays on that port, which is the API's default CORS origin.

```bash
pnpm --filter @split-bill/web test
pnpm --filter @split-bill/web typecheck
pnpm --filter @split-bill/web build
```

`pnpm test`, `pnpm typecheck`, and `pnpm build` at the repo root include this app along with `packages/shared` and `apps/api`.

## Environment

Copy `.env.example` to `.env` if you want to override the defaults. Nuxt reads `NUXT_PUBLIC_*` into `runtimeConfig.public` (`nuxt.config.ts`). Nothing is hardcoded in the pages.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Base URL of `apps/api`, no trailing slash. Used only when the mock is off. |
| `NUXT_PUBLIC_USE_MOCK_API` | `true` | `true` keeps bills in `localStorage` and returns a sample parse. `false` calls the real API. |

Set `NUXT_PUBLIC_USE_MOCK_API=false` to call `POST /bills/parse`, `POST /bills`, `GET /bills/:id`, and `PUT /bills/:id`.

`POST /bills/parse` without `OPENAI_API_KEY` returns 503 `{ "error": "Bill parsing is not configured" }`. The upload screen explains that and offers manual entry. A 429 returns `{ "error": "Too many parse requests" }` and a `Retry-After` header in seconds. The screen shows that wait when the header is present, and still offers manual entry.

In mock mode, a photo named with `fail` or `error` returns a parse error, `unavailable` returns 503, and `rate` returns 429 with a 30 second wait. "Coba bon contoh" / "Try a sample bill" runs the same parse path with a built-in cafe bill (including a negative pembulatan). Saved links work in the browser that created them; another device needs the real API.

## Shared package

Types, zod schemas, and `calculateSplit` come from `@split-bill/shared` (`workspace:*`). The preview on the split screen and the saved payer totals both use that function, so they stay on the same rounding rules. Bill total is subtotal + tax + service charge − discount + rounding. Rounding is optional whole rupiah, may be negative, and defaults to 0.

## Split rules

Same as `packages/shared`: a shared line is split in whole rupiah, with leftover rupiah going to the earliest payers. Tax, service, discount, and rounding follow each payer's item subtotal, including a virtual share for items that are still unassigned. The leftover rupiah of each of those amounts go to the payer with the largest subtotal so that, once every item is assigned, payer totals sum to the bill total. A bill cannot be saved until every item is assigned.
