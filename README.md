# Tiered Pricing

A private Shopify app for Sparkly Tails that gives customers volume pricing on products — e.g. 1 × £1.70, 5+ × £1.45, 10+ × £1.40 — and reconciles those tiers into real Shopify automatic discounts.

## What it does

- Lets staff define "tier groups" (e.g. "Standard voucher: 5+ → 15% off, 10+ → 18% off") in an admin UI embedded in the Shopify admin
- Assigns Shopify products to a group and computes each product's real resulting price from its actual Shopify price — never a placeholder
- Clicking **Go live** reconciles the group's tiers into real per-product Shopify automatic discounts, and reconciles again automatically if products are added or removed while the group is live
- All business data lives in Shopify metafields — no database

## Env vars

| Var | Exposure | Source |
|---|---|---|
| `SHOPIFY_API_SECRET_KEY` | Server only | Client Secret in the Partners dashboard |
| `NEXT_PUBLIC_SHOPIFY_API_KEY` | Public | API Key (Client ID) in the Partners dashboard |
| `SHOPIFY_SHOP` | Server | `storename.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Server only | Captured once via OAuth (see `auth/callback` console log); no database, so this env var is the only place it's stored |

See [`.env.local.example`](.env.local.example) for a fillable template.

## For developers

Stack: Next.js 16 (App Router) · TypeScript · Vitest · Shopify Admin GraphQL API · Vercel.

```bash
nvm use            # pins Node 20.20.2, see .nvmrc
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

Never commit `.env.local` or put secrets in `NEXT_PUBLIC_` variables. Bump `version` in `package.json` with every change — it's shown in the app header, which is the fastest way to confirm a deploy landed.

More detail:
- [`docs/superpowers/specs/`](docs/superpowers/specs) — design spec
- [`docs/superpowers/plans/`](docs/superpowers/plans) — implementation plan (Phase 1)
