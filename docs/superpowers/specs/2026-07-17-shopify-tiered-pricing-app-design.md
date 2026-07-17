# Shopify Tiered Pricing App — Design

**Date:** 2026-07-17
**Status:** Approved, ready for implementation planning
**Store:** Sparkly Tails (`sparklytails.com`) — Shopify **Basic** plan, GBP, Europe/London

> **Revision (2026-07-17):** Two decisions changed after initial approval, based on
> user feedback: (1) §2.5 now uses Shopify's native Google & YouTube channel instead
> of a custom feed — this removes the feed-price-mismatch risk and an entire phase
> of work; (2) the admin UI computes real per-product resulting prices from each
> product's actual Shopify price (§4), never a placeholder.

---

## 1. Purpose

Give customers volume pricing on voucher products (e.g. 1 × £1.70, 5+ × £1.45,
10+ × £1.40), and show those tiers on the product page with the price updating live
as quantity changes. Google Shopping listings continue to sync via Shopify's native
Google & YouTube channel, unaffected by this app (§2.5).

Built as a private Shopify app for Sparkly Tails only. It may later be published to
the Shopify App Store as a commercial app, so the design keeps that path open — but
nothing is built for it now.

---

## 2. Decisions and why

Each of these was settled by checking Shopify's docs or the store's actual
configuration, not by assumption. The reasoning is recorded because several of
them contradict an intuitive reading of the requirements.

### 2.1 Distribution: Partners development app

**Not** an admin-created custom app via *Settings → Apps → Develop apps*. That route
fails for three independent reasons:

1. It is **closed to new apps**: "You can no longer create new custom apps in the
   Shopify admin. Existing admin-created custom apps continue to work. To create a
   new custom app, use the Dev Dashboard or Shopify CLI."
   ([docs](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin))
2. It **cannot use extensions**: "Custom apps created in the Shopify admin can't use
   extensions... If you're building a solution for a single store, then build your
   custom app in the Partner Dashboard."
   ([docs](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/contracts))
   The storefront widget *is* a theme app extension, so this is disqualifying.
3. It **cannot be embedded** (`isEmbeddedApp: false`).

A Partners **development app** satisfies the actual requirement — private, never
published, installed only on Sparkly Tails — while supporting embedding, theme
extensions, and eventual publication. This is the same route the Pickup App uses
(verified: OAuth routes at `src/app/api/auth/{start,callback,session}`,
`frame-ancestors` CSP in `next.config.ts`, no `shopify.app.toml`).

> Note: the Pickup App's own `docs/plans/2026-07-03-pickup-app.md` still describes
> the Develop-apps route. That plan is stale — the app was rebuilt on Partners OAuth
> on 2026-07-06 and the doc was never updated.

### 2.2 Pricing engine: native automatic discounts

Shopify Functions are **not available** to this app: "Stores on any plan can use
public apps that are distributed through the Shopify App Store and contain
functions. **Only stores on a Shopify Plus plan can use custom apps that contain
Shopify Function APIs.**"
([docs](https://shopify.dev/docs/apps/build/functions)) Sparkly Tails is on **Basic**
(verified via `get-shop-info`), and the app is private. Functions are therefore
blocked until the app is published to the App Store — at which point they become
available on any plan.

Native automatic discounts work correctly as a tier engine because Shopify resolves
competing discounts in the customer's favour: "If two or more discounts are applied
but can't be combined... then the best discount for the customer's cart is always
applied."
([Help Center](https://help.shopify.com/en/manual/discounts/discount-combinations))
Since tiers improve monotonically with quantity, "best wins" *is* correct tier
selection:

| Cart | Discounts matching | Applied | Correct |
|---|---|---|---|
| 7 units | 5+ | £1.45 | ✅ |
| 12 units | 5+, 10+ | £1.40 | ✅ |
| 20 units | 5+, 10+, 20+ | £1.35 | ✅ |

**Constraint:** max **25 active automatic discounts per store**
([Help Center](https://help.shopify.com/en/manual/discounts/discount-methods/automatic-discounts)).
This is a store-wide budget shared with any seasonal or promotional discount.

### 2.3 Threshold semantics: per-product

`DiscountMinimumQuantity` "applies to qualifying items in the customer's cart"
([docs](https://shopify.dev/docs/api/admin-graphql/latest/objects/DiscountMinimumQuantity))
— i.e. to whatever products the discount targets. A discount targeting several
products would therefore count the threshold *across* them (mix-and-match).

**Decision: per-product.** A tier group defines a reusable tier *shape*, but the app
creates discounts scoped to each product individually, so "5+" always means 5 of that
same product.

Rationale: mix-and-match would make the product-page widget unable to predict the
price without reading live cart state, and the displayed price could change because
of items not on the current page. Per-product keeps the widget's math exact and
self-contained, and matches the original requirement ("1 product £1.70, 5+ £1.45").

**Slot cost:** one discount per tier per product, i.e. `tiers × products ≤ 25`
store-wide, shared with any seasonal discount:

| Tiers per product | Max products |
|---|---|
| 2 (5+, 10+) | 12 |
| 3 (5+, 10+, 20+) | 8 |
| 4 | 6 |

**Groups are organisational, not slot-saving.** A group lets you define a tier shape
once and reuse it across products, and gives the app somewhere to track and report
slot usage — but because discounts are scoped per-product, putting 5 products in one
group still costs 5 × *tiers* slots. Grouping does not raise the product ceiling.
This is the direct cost of per-product threshold semantics, accepted in exchange for
widget correctness.

Made visible via the slot meter (§5.2); removed entirely by publishing the app and
swapping to a Function.

### 2.4 Storefront: loose units only

Customers only ever add **loose units** of the real product. There are no buyable
packs, no bundle variants, and no bundle inventory wiring.

This deletes several original requirements as unnecessary rather than descoped:

| Original requirement | Outcome |
|---|---|
| Bundle variants tracking product quantities | **Deleted** — buying N real units decrements real stock natively |
| Shopify bundles | **Deleted** — nothing to bundle |
| Excluding bundles from automatic discounts | **Deleted** — nothing buyable to stack onto |

Inventory tracking — explicitly the most important requirement — is satisfied for
free: the thing sold *is* the actual product, so Shopify decrements real stock with
no code.

### 2.5 Google Shopping: Shopify's native Google & YouTube channel

No custom feed is built. Google Shopping listings are synced via Shopify's native
**Google & YouTube** sales channel, the same as any other product on the store.

This means Google Shopping shows each product's real, undiscounted base price —
tiered pricing does not appear as a separate "5 for £X" multipack offer in ads. That
trade-off is accepted deliberately: it removes an entire class of risk (a feed row
priced differently from the product's real landing price is exactly what triggers
Merchant Center's price-mismatch disapproval), removes an entire phase of work, and
needs zero code from this app. If bulk-price ad callouts are wanted later, the
reversible path is
[Google Merchant Promotions](https://support.google.com/merchants/answer/2906014) —
a promotion badge layered on the existing native listing, not a new priced offer.

### 2.6 Storage: metafields, no database

All business data lives in Shopify metafields. The access token lives in
`SHOPIFY_ACCESS_TOKEN` (a path the `shopify-app-auth` skill already supports), so
the app has **no database at all**.

Trade-off: without a database there is no `APP_UNINSTALLED` token wipe, so a
reinstall requires re-pasting the token into Vercel env once. Acceptable for a
single-store private app. Adding a token collection later is a contained change.

---

## 3. Architecture

```
┌─ ADMIN APP (Next.js 16, embedded, Vercel) ──────────────┐
│  Tier groups: create, assign products, go live          │
│  Slot meter: "12 of 25 discount slots used"             │
│  Settings: copy templates + CSS                         │
└────────────────────┬────────────────────────────────────┘
                     │ writes
                     ▼
┌─ SHOPIFY METAFIELDS ── the single source of truth ──────┐
│  shop.sparkly_tiers.config    → groups, tiers, products │
│  shop.sparkly_tiers.settings  → copy + CSS              │
│  product.sparkly_tiers.tiers  → denormalised for widget │
└──────┬──────────────────┬───────────────────────────────┘
       │ app reconciles   │ Liquid reads
       ▼                  ▼
┌─ AUTOMATIC ─┐  ┌─ THEME APP ────┐        Google Shopping ads sync via
│  DISCOUNTS  │  │  EXTENSION     │        Shopify's native Google & YouTube
│  per product│  │  tier table +  │        channel — no code in this app.
│  real price │  │  live price JS │        See §2.5.
└─────────────┘  └────────────────┘
```

Metafields are the only state. Discounts and widget are **projections** of them.
This is what makes the eventual native→Function engine swap a contained change: it
replaces one projection and touches nothing else.

### Units and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/tier-math` | target price ↔ percent, resulting price, rounding | nothing (pure) |
| `lib/reconciler` | diff desired vs actual → actions | `tier-math` (pure) |
| `lib/shopify-discounts` | execute actions via Admin GraphQL | Shopify API |
| `lib/metafields` | read/write config, settings, per-product tiers | Shopify API |
| `lib/products` | read a product's real base price | Shopify API |
| Admin UI | groups, product assignment, settings, slot meter | all of the above |
| Theme app extension | render tiers, live price | product metafield only |

`tier-math` and `reconciler` are pure and testable without Shopify. That is
deliberate: it is where every money bug would otherwise hide.

---

## 4. Data model

### `shop.sparkly_tiers.config` (JSON) — master record

```json
{
  "groups": [
    {
      "id": "grp_standard",
      "name": "Standard voucher",
      "status": "live",
      "tiers": [
        { "minQty": 5,  "percentOff": 14.7 },
        { "minQty": 10, "percentOff": 17.6 }
      ],
      "productIds": ["gid://shopify/Product/123"],
      "discountIds": {
        "gid://shopify/Product/123": {
          "5":  "gid://shopify/DiscountAutomaticNode/aaa",
          "10": "gid://shopify/DiscountAutomaticNode/bbb"
        }
      }
    }
  ]
}
```

`discountIds` is keyed by product then threshold, because §2.3 scopes discounts
per-product.

### `shop.sparkly_tiers.settings` (JSON)

Copy templates (tier row text, savings label) and CSS custom property values for
fonts and styling.

### `product.sparkly_tiers.tiers` (JSON) — denormalised

```json
{
  "groupId": "grp_standard",
  "basePrice": "1.70",
  "tiers": [
    { "minQty": 5,  "unitPrice": "1.45" },
    { "minQty": 10, "unitPrice": "1.40" }
  ]
}
```

Rewritten whenever the group's tiers change or products are assigned. Exists so the
widget can render **in Liquid, server-side**, with no API call and no flash of wrong
price. Denormalisation is intentional; `config` remains authoritative and the
reconciler rewrites this on every save.

### Price representation

Tiers are stored as **percent off**, not absolute prices, so a tier shape can be
reused across products with different base prices.

> **Units — read this before writing any pricing code.** `percentOff` in the config
> metafield is a **percentage** (`14.7` means 14.7%). Shopify's
> `customerGets.value.percentage` is a **fraction** (`0.147` means 14.7%). The
> conversion (`percentOff / 100`) belongs in `tier-math` and nowhere else, and must
> have a dedicated test. Getting this wrong is a 10× pricing error in live discounts.

In the UI you enter a **target price** (£1.45) and the app back-computes the percent,
then displays the **actual resulting price for every product in the group** before
saving. This makes rounding visible up front: 14.7% off £1.70 is £1.4501, which
Shopify may round to £1.45 or £1.46. The alternative — fixed amount off per item
(`appliesOnEachItem: true`) — hits exact prices but only works for products sharing a
base price, which would defeat reusable tier shapes.

---

## 5. Components

### 5.1 Reconciler

```
reconcile(desired: Config, actual: Discount[]) → Action[]
```

A pure function that diffs the config against Shopify's actual discounts and emits
`create` / `update` / `delete` actions. A thin `apply(actions)` performs the
mutations.

- **Idempotent** — running twice is a no-op, so "reconcile on every save" is safe.
- **Self-healing** — if someone hand-edits a discount in the Shopify admin, the next
  save restores the configured state.
- **Budget-safe** — checks the slot budget before applying and **refuses entirely**
  rather than half-applying if a change would exceed 25 discounts.

Discount shape per product per tier:

```graphql
discountAutomaticBasicCreate(automaticBasicDiscount: {
  title: "Tiers: Standard voucher — Chicken Voucher — 5+"
  startsAt: <now>
  minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: "5" } }
  customerGets: {
    value: { percentage: 0.147 }
    items: { products: { productsToAdd: ["gid://shopify/Product/123"] } }
  }
  combinesWith: { productDiscounts: false, orderDiscounts: true, shippingDiscounts: true }
})
```

`productDiscounts: false` is deliberate — stacking product discounts on one cart line
is Shopify Plus only, and tier discounts must never stack with each other.

### 5.2 Admin UI

- **Groups list** — name, tier shape, product count, status, slots consumed.
- **Group editor** — tier thresholds and target prices; live table of resulting
  actual prices per assigned product; product assignment.
- **Slot meter** — "12 of 25 discount slots used", always visible. Warns as it fills
  and blocks saves that would exceed the cap, naming what would need to be removed.
- **Settings** — copy templates and CSS.

Draft groups write config but create no discounts; going live runs the reconciler.

### 5.3 Theme app extension

An **app block** placed in the product section via the theme editor. Reads
`product.sparkly_tiers.tiers` in **Liquid** — server-rendered, correct on first paint.
JS handles only the interactive part: recomputing the displayed price client-side as
quantity changes, using the same math as `tier-math`.

Styling comes from `shop.sparkly_tiers.settings`, injected as CSS custom properties so
theme fonts inherit naturally.

**Caveat:** the widget *predicts*; Shopify's discount *decides*. Per-product semantics
(§2.3) is what makes the prediction exactly mirror reality. Widget and reconciler are
tested against shared fixtures to keep them in sync.

### 5.4 Google Shopping

No app component. Handled entirely by Shopify's native Google & YouTube sales
channel — see §2.5.

---

## 6. Auth

Per the `shopify-app-auth` skill (v2.0.0), unchanged:

- Partners app, legacy install flow, embedded.
- OAuth: `auth/start` verifies HMAC and redirects — nothing else; all "skip OAuth"
  logic lives in `proxy.ts`.
- Stateless `?stt=` URL token, 10-minute TTL, minted fresh on every verified request.
  No cookies, no App Bridge — both are confirmed unreliable in the Shopify iPad app.
- `AuthLink` everywhere, enforced by the ESLint rule blocking bare `next/link`.
- `frame-ancestors` CSP in `next.config.ts`.
- Scopes: `write_discounts`, `read_discounts`, `write_products`, `read_products`.
  Scopes are set in `auth/start`, not the Partners dashboard, and changing them
  requires reinstall — so they are set generously up front.

Exempt from the proxy guard: `/api/auth/*`, `/api/webhooks/*`, `/_next/*`.

---

## 7. Phasing

| Phase | Ships | Proves |
|---|---|---|
| **1 — Engine** | Tier groups, reconciler, slot meter, admin UI | Real tier prices at checkout |
| **2 — Storefront** | Theme app extension, tier table | Customers see and get the tiers |
| **Later** | Publish to App Store → swap engine to a Function | Removes the 25-slot cap |

Google Shopping needs no phase of its own — it is Shopify's native Google & YouTube
channel, unaffected by anything this app builds (§2.5).

> **Planning scope.** A single implementation plan should cover **Phase 1 only**.
> Phase 2 (the storefront widget) gets its own plan once Phase 1 lands.

---

## 8. Testing

Pure units carry the correctness burden:

- **`tier-math`** — target price → percent → resulting price; rounding boundaries;
  the £1.4501 case. Money bugs live here.
- **`reconciler`** — tier add/remove/change, product assign/unassign, group
  draft/live/delete, idempotency (second run is a no-op), drift-heal, slot-budget
  refusal (all-or-nothing, never partial).
- **Widget** — same fixtures as the reconciler, asserting predicted price equals the
  price the reconciler's discount would produce.

Integration: install on a development store, create a group, verify the discount
appears correctly in the Shopify admin and that a real cart hits the right tier price
at checkout.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **25-slot cap** → ~8 products | Medium | Slot meter; refuse rather than half-apply; publish→Function removes it |
| **Max products-per-discount** is undocumented | Low | Validate in Phase 1. With per-product scoping each discount targets exactly one product, so this is unlikely to bind at all |
| **Widget predicts ≠ Shopify decides** | Medium | Per-product semantics; shared test fixtures |
| **Rounding** (14.7% of £1.70 = £1.4501) | Medium | UI shows actual resulting price per product before save |
| **Token in env, no DB** → reinstall needs manual re-paste | Low | Accepted trade-off; adding a token collection later is contained |

**Accepted trade-off:** Google Shopping ads show each product's real base price, not
a "5 for £X" bulk callout — a direct consequence of §2.5's choice to use Shopify's
native channel instead of a custom feed. Reversible later via Google Merchant
Promotions if bulk-price ad callouts become a priority.

---

## 10. Explicitly out of scope

- Shopify bundles and bundle inventory (§2.4 — unnecessary, not descoped)
- Buyable tier packs / multipack products
- Shopify Functions (§2.2 — blocked until published)
- Multi-shop token storage (single store; needed only if published)
- Mix-and-match tier groups (§2.3 — rejected for widget correctness)
- Minimum *purchase amount* tiers — only minimum *quantity* tiers are in scope
- A custom Google Merchant feed, multipack feed rows, and any `?qty=` deep link
  (§2.5 — superseded by using Shopify's native Google & YouTube channel)
