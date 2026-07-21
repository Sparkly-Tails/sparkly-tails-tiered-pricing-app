# Shopify Tiered Pricing App — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tiered-pricing discount engine — a Next.js admin app that lets Sparkly Tails define per-product volume-price tiers, computes real resulting prices from each product's actual Shopify price, and reconciles the tiers into real Shopify automatic discounts.

**Architecture:** A Next.js 16 App Router app, embedded in the Shopify admin via the proven stateless `?stt=` auth pattern (Partners development app, OAuth, no database — the access token lives in an env var). Business data lives entirely in a shop metafield. Two pure, Shopify-free libraries (`tier-math`, `reconciler`) carry all pricing correctness and are TDD'd in isolation; a thin `shopify-discounts` layer executes the reconciler's decisions as GraphQL mutations, and a `products` lookup supplies each product's real Shopify price so tier prices are never placeholders. The admin UI is server-rendered pages reading/writing the metafield through Server Actions. Google Shopping needs no code here — it's handled entirely by Shopify's native Google & YouTube sales channel.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest (unit tests — chosen over Jest because the codebase is pure ESM/TypeScript with no need for Jest's CommonJS-era config), Shopify Admin GraphQL API 2025-10, Vercel.

## Global Constraints

These apply to every task below; re-stated here so no single task can be reviewed in isolation from them.

- **No database.** All business data lives in Shopify metafields. The Shopify access token lives in the `SHOPIFY_ACCESS_TOKEN` env var (set manually after OAuth — see Task 2's `auth/callback`), not MongoDB.
- **Auth pattern is exact, not "similar to."** Stateless `?stt=` URL/header token, 10-minute TTL, no cookies, no App Bridge. `src/proxy.ts` (not `middleware.ts` — Next.js 16 renamed the export). Every internal link uses `AuthLink`, enforced by an ESLint `no-restricted-imports` rule. This is copied near-verbatim from the working `sparkly-tails-pickup-app` repo, which has already ruled out cookies and App Bridge on real hardware — do not re-litigate that decision.
- **`auth/start` has exactly one job:** verify HMAC, redirect to OAuth. No session/skip-OAuth logic belongs there — that lives in `proxy.ts`.
- **`auth/callback` redirects to `https://${shop}/admin`**, never back to the app's own URL.
- **Build the OAuth callback URL from `req.url`**, never from an env var (avoids trailing-slash mismatches).
- **Scopes:** `write_discounts,read_discounts,write_products,read_products` — set in `auth/start`, not the Partners dashboard.
- **`percentOff` in config is a PERCENTAGE** (e.g. `14.7` meaning 14.7%). Shopify's `customerGets.value.percentage` field is a **FRACTION** (e.g. `0.147`). The conversion (`percentOff / 100`) lives in exactly one place — `tier-math` — and has a dedicated test. Getting this wrong is a 10× pricing bug in a live discount.
- **Discounts are scoped per-product.** One discount per tier per product — never one discount targeting multiple products. Slot cost is `tiers × products`, budget is 25 active automatic discounts store-wide.
- **The reconciler is all-or-nothing.** If applying a change would push the store over the 25-discount budget, it must refuse the entire change — never partially apply it.
- **The reconciler is idempotent.** Running it twice with the same desired config produces zero additional actions the second time.
- **`combinesWith` on every tier discount:** `{ productDiscounts: false, orderDiscounts: true, shippingDiscounts: true }`.
- **`APP_VERSION` is bumped in every commit that changes code** — patch for fixes/infrastructure, minor for user-facing features — in the same commit as the change. Displayed as a small `v{version}` badge in the root layout (`src/app/layout.tsx`, added in Task 3), visible on every page, so a deploy is visually confirmable. Read the current value from `package.json` and increment it — never hardcode a target version, since each task builds on whatever the previous task actually committed.
- **Store facts:** Shopify **Basic** plan, **GBP**, Europe/London. Shopify Functions are unavailable to this app (Plus-only for private/custom apps) — do not reach for one.
- Node 20.20.2 is the target runtime (confirmed installed).

---

### File Structure

```
sparkly-tails-tiered-pricing-app/
  package.json
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  vitest.config.ts
  .env.local.example
  src/
    proxy.ts                          # Task 2 — auth guard
    lib/
      shopify-auth.ts                 # Task 2 — HMAC + token verify (copied from pickup app)
      auth-token.ts                   # Task 3 — client-side token state
      auth-redirect.ts                # Task 3 — Server Action redirect helper
      useAuthRouter.ts                # Task 3 — router wrapper
      shopify-client.ts               # Task 4 — raw GraphQL fetch wrapper
      metafields.ts                   # Task 5 — read/write shop + product metafields
      tier-math.ts                    # Task 6 — pure pricing math
      reconciler.ts                   # Task 7 — pure diff → actions
      shopify-discounts.ts            # Task 8 — actions → GraphQL mutations
      products.ts                      # Task 9 — real product base price lookup
    components/
      AuthTokenInit.tsx                # Task 3
      AuthLink.tsx                     # Task 3
    app/
      layout.tsx                       # Task 3 — mounts AuthTokenInit
      page.tsx                         # Task 10 — groups list (home)
      globals.css                      # Task 1
      groups/
        new/page.tsx                   # Task 11 — create group form
        [groupId]/page.tsx              # Task 12 — edit group, assign products, slot meter, real per-product prices
      api/
        auth/
          start/route.ts               # Task 2
          callback/route.ts            # Task 2
        debug/route.ts                 # Task 2 — dev-only state inspector
    actions/
      groupActions.ts                  # Task 11, 12 — Server Actions: create/update/delete group, assign products, go live
  tests/
    lib/
      tier-math.test.ts                # Task 6
      reconciler.test.ts               # Task 7
      products.test.ts                 # Task 9
    fixtures/
      groups.ts                        # Task 7 — shared test fixtures
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `.env.local.example`
- Create: `src/app/layout.tsx` (minimal placeholder — replaced in Task 3)
- Create: `src/app/page.tsx` (minimal placeholder — replaced in Task 10)
- Create: `src/app/globals.css`
- Create: `.gitignore` (already exists — extend it)

**Interfaces:**
- Consumes: nothing
- Produces: a runnable Next.js app skeleton (`npm run dev` serves a blank page) that every later task builds inside. `APP_VERSION` constant available via `package.json`'s `version` field.

- [ ] **Step 1: Initialize the package.json**

```json
{
  "name": "sparkly-tails-tiered-pricing-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20.19.43",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/Documents/sparkly-tails-tiered-pricing-app
npm install
```

Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create next.config.ts with the embedding CSP**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Allow Shopify admin to embed this app in an iframe
            value:
              'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
```

- [ ] **Step 5: Create eslint.config.mjs (auth-link rule added now, enforced from Task 3 onward)**

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Every internal link must carry the auth token (see src/proxy.ts) or it
  // silently 403s. AuthLink.tsx is the only place allowed to import next/link.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/AuthLink.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Use AuthLink (src/components/AuthLink.tsx) instead — a bare next/link silently drops the auth token.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 7: Create .env.local.example**

```bash
# Shopify Partners app credentials (Partners dashboard → your app → API credentials)
SHOPIFY_API_SECRET_KEY=
NEXT_PUBLIC_SHOPIFY_API_KEY=

# Store this app talks to
SHOPIFY_SHOP=sparklytails.myshopify.com

# Set manually after completing OAuth once (see Task 8 / auth/callback logs) —
# there is no database, so this is the only place the access token lives.
SHOPIFY_ACCESS_TOKEN=
```

- [ ] **Step 8: Extend .gitignore**

Read the current `.gitignore`, then add Next.js/Vitest-specific entries:

```
node_modules/
.next/
.env*.local
.vercel
coverage/
```

- [ ] **Step 9: Create a minimal placeholder layout and page**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkly Tails — Tiered Pricing",
  description: "Volume pricing admin",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <p>Sparkly Tails Tiered Pricing — scaffold OK</p>;
}
```

`src/app/globals.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 10: Verify the app builds and runs**

```bash
npm run build
```

Expected: `Compiled successfully`, no type errors.

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000 | grep "scaffold OK"
kill %1
```

Expected: the grep finds the placeholder text.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts .env.local.example .gitignore src/
git commit -m "Scaffold Next.js 16 app with Tailwind, ESLint, and Vitest"
```

---

### Task 2: Auth core — HMAC verify, stateless token, proxy, OAuth routes

This is copied near-verbatim from the working `sparkly-tails-pickup-app` repo (`~/Documents/sparkly-tails-pickup-app`), which has already proven this pattern in production, including ruling out cookies and App Bridge on real Shopify iPad hardware. Do not redesign it — the one deliberate difference is `auth/callback`, which has nowhere to persist the token (no database) and must log it for one-time manual capture into Vercel env instead.

**Files:**
- Create: `src/lib/shopify-auth.ts`
- Create: `src/proxy.ts`
- Create: `src/app/api/auth/start/route.ts`
- Create: `src/app/api/auth/callback/route.ts`
- Create: `src/app/api/debug/route.ts`
- Test: `tests/lib/shopify-auth.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `verifyShopifyHmac(params: URLSearchParams, secret: string): Promise<boolean>`, `makeSessionToken(shop: string, secret: string): Promise<string>`, `verifyUrlToken(token: string, secret: string): Promise<boolean>` — used by `proxy.ts` and both auth routes, and by Task 3's `auth-redirect.ts`.

- [ ] **Step 1: Write the failing test for HMAC verify and token round-trip**

```typescript
// tests/lib/shopify-auth.test.ts
import { describe, it, expect } from 'vitest'
import { verifyShopifyHmac, makeSessionToken, verifyUrlToken } from '@/lib/shopify-auth'

describe('verifyShopifyHmac', () => {
  it('rejects a request with no hmac param', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com' })
    expect(await verifyShopifyHmac(params, 'secret')).toBe(false)
  })

  it('rejects an invalid hmac', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com', hmac: 'wrong' })
    expect(await verifyShopifyHmac(params, 'secret')).toBe(false)
  })
})

describe('makeSessionToken / verifyUrlToken', () => {
  it('accepts a freshly minted token', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'secret')
    expect(await verifyUrlToken(token, 'secret')).toBe(true)
  })

  it('rejects a token signed with the wrong secret', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'secret-a')
    expect(await verifyUrlToken(token, 'secret-b')).toBe(false)
  })

  it('rejects a malformed token', async () => {
    expect(await verifyUrlToken('not-a-real-token', 'secret')).toBe(false)
  })

  it('rejects a token older than the 10-minute window', async () => {
    // Construct an expired token directly: shop|timestamp-11-minutes-ago|validSig
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000
    const shop = 'test.myshopify.com'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${shop}|${elevenMinutesAgo}`))
    const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const expiredToken = `${shop}|${elevenMinutesAgo}|${sigHex}`
    expect(await verifyUrlToken(expiredToken, 'secret')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/shopify-auth.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/shopify-auth'`.

- [ ] **Step 3: Write shopify-auth.ts**

```typescript
// src/lib/shopify-auth.ts
// All crypto uses Web Crypto API — safe to import in Edge middleware (proxy.ts).

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verify Shopify's HMAC signature on the initial app-load URL. */
export async function verifyShopifyHmac(
  params: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const message = [...params.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const digest = await hmacSha256(secret, message)
  return timingSafeEqual(digest, hmac)
}

/** Create a signed session token — same format used for both the URL token and (unused here) a cookie fallback. */
export async function makeSessionToken(
  shop: string,
  secret: string,
): Promise<string> {
  const ts = Date.now().toString()
  const payload = `${shop}|${ts}`
  const sig = await hmacSha256(secret, payload)
  return `${payload}|${sig}`
}

async function verifyTokenWithMaxAge(
  token: string,
  secret: string,
  maxAgeMs: number,
): Promise<boolean> {
  const parts = token.split('|')
  if (parts.length !== 3) return false
  const [shop, ts, sig] = parts
  if (Date.now() - parseInt(ts) > maxAgeMs) return false
  const expected = await hmacSha256(secret, `${shop}|${ts}`)
  return timingSafeEqual(expected, sig)
}

/**
 * Verify a stateless URL/header-carried auth token. 10-minute window since it
 * travels in URLs and request/response headers rather than an httpOnly cookie.
 * No cookie or App Bridge session token is used anywhere in this app — both
 * are confirmed unreliable in the Shopify iPad app's webview (see the
 * sparkly-tails-pickup-app repo history and the shopify-app-auth skill).
 */
export async function verifyUrlToken(
  token: string,
  secret: string,
): Promise<boolean> {
  return verifyTokenWithMaxAge(token, secret, 10 * 60 * 1000)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/shopify-auth.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Create proxy.ts**

```typescript
// src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifyUrlToken,
} from '@/lib/shopify-auth'

// No cookie anywhere in this file, deliberately — see shopify-auth.ts's
// module comment. The `stt` URL/header token is the one mechanism that
// doesn't depend on anything surviving between requests.

async function nextWithFreshToken(req: NextRequest, shop: string, secret: string): Promise<NextResponse> {
  const freshToken = await makeSessionToken(shop, secret)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-auth-token', freshToken)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-auth-token', freshToken)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/debug')
  ) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  const shop = process.env.SHOPIFY_SHOP

  if (!secret || !apiKey || !shop) {
    return new NextResponse('App misconfigured: missing env vars (503)', { status: 503 })
  }

  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    if (!valid) {
      return new NextResponse('HMAC verification failed', { status: 403 })
    }

    if (searchParams.has('host')) {
      return nextWithFreshToken(req, shop, secret)
    }

    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  const urlToken = searchParams.get('stt')
  if (urlToken && (await verifyUrlToken(urlToken, secret))) {
    return nextWithFreshToken(req, shop, secret)
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
```

- [ ] **Step 6: Create auth/start route**

```typescript
// src/app/api/auth/start/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

// This route has exactly one job: redirect to Shopify OAuth. No
// session/skip-OAuth logic belongs here — that lives in proxy.ts.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')

  if (!shop) return new NextResponse('Missing shop', { status: 400 })

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) {
    return new NextResponse('Invalid HMAC', { status: 403 })
  }

  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'write_discounts,read_discounts,write_products,read_products'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  return NextResponse.redirect(oauthUrl.toString())
}
```

- [ ] **Step 7: Create auth/callback route (no database — logs token for manual capture)**

```typescript
// src/app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')

  if (!shop || !code) {
    return new NextResponse('Missing shop or code', { status: 400 })
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) return new NextResponse('Invalid HMAC', { status: 403 })

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: secret, code }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[auth/callback] token exchange failed:', tokenRes.status, body)
    return new NextResponse('Token exchange failed', { status: 502 })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // No database in this app — there is nowhere to persist the token
  // automatically. Log it once so it can be copied into the
  // SHOPIFY_ACCESS_TOKEN env var in Vercel. This only happens on install/
  // reinstall, which is rare for a single-store private app (see spec §2.6
  // and §9 for the accepted trade-off).
  console.log('[auth/callback] OAuth complete for shop:', shop)
  console.log('[auth/callback] Copy this into SHOPIFY_ACCESS_TOKEN in Vercel env vars:')
  console.log('[auth/callback] ACCESS_TOKEN=' + access_token)

  const adminUrl = `https://${shop}/admin`
  return NextResponse.redirect(adminUrl)
}
```

- [ ] **Step 8: Create the debug endpoint (dev-only state inspector — gated by NODE_ENV, not just a comment)**

```typescript
// src/app/api/debug/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  // Returns config presence/shop domain — real information disclosure if
  // left reachable in production. NODE_ENV !== 'development' means a 404,
  // not a 503 or an auth challenge, so it doesn't even confirm the route
  // exists. Vercel production deploys always run with NODE_ENV=production,
  // so this is closed automatically with no env var to remember to set.
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  return NextResponse.json({
    secretSet: !!process.env.SHOPIFY_API_SECRET_KEY,
    secretLength: process.env.SHOPIFY_API_SECRET_KEY?.length ?? 0,
    apiKeySet: !!process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    shopSet: !!process.env.SHOPIFY_SHOP,
    shop: process.env.SHOPIFY_SHOP ?? null,
    accessTokenSet: !!process.env.SHOPIFY_ACCESS_TOKEN,
  })
}
```

- [ ] **Step 9: Verify the app still builds**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 10: Bump APP_VERSION**

Per the Global Constraints, every commit that changes code bumps the version. This task adds infrastructure, not a user-facing feature, so bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1 (e.g. `0.1.0` → `0.1.1`).

- [ ] **Step 11: Commit**

```bash
git add src/lib/shopify-auth.ts src/proxy.ts src/app/api/auth src/app/api/debug tests/lib/shopify-auth.test.ts package.json
git commit -m "Add Shopify OAuth auth core: HMAC verify, stateless token, proxy guard"
```

---

### Task 3: Client-side token plumbing, AuthLink, root layout

**Files:**
- Create: `src/lib/auth-token.ts`
- Create: `src/lib/auth-redirect.ts`
- Create: `src/lib/useAuthRouter.ts`
- Create: `src/components/AuthTokenInit.tsx`
- Create: `src/components/AuthLink.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `makeSessionToken` from `@/lib/shopify-auth` (Task 2)
- Produces: `appendToken(href: string, token: string): string`, `setAuthToken(token: string): void`, `getAuthToken(): string` — used by every page/component that renders a link (Tasks 10, 11, 12) and by `redirectWithToken(path: string): Promise<never>` for Server Action redirects. Also adds a small `v{package.json version}` badge to the root layout, visible on every page from this task onward — the app-wide version display the Global Constraints require.

- [ ] **Step 1: Create auth-token.ts**

```typescript
// src/lib/auth-token.ts
// Client-side auth token state. Plain module-level variable, not React
// state — nothing needs to re-render when it changes.
let currentToken = ''

export function setAuthToken(token: string) {
  currentToken = token
}

export function getAuthToken(): string {
  return currentToken
}

/** Appends `token` as the `stt` query param, preserving any existing query string. */
export function appendToken(href: string, token: string): string {
  if (!token) return href
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.set('stt', token)
  return `${path}?${params.toString()}`
}
```

- [ ] **Step 2: Create AuthTokenInit.tsx**

```tsx
// src/components/AuthTokenInit.tsx
'use client'

import { useEffect } from 'react'
import { setAuthToken, getAuthToken, appendToken } from '@/lib/auth-token'

type WindowWithPatchFlag = { __authFetchPatched?: boolean }

export default function AuthTokenInit({ initialToken }: { initialToken: string }) {
  useEffect(() => {
    setAuthToken(initialToken)

    const w = window as unknown as WindowWithPatchFlag
    if (w.__authFetchPatched) return
    w.__authFetchPatched = true

    const originalFetch = window.fetch.bind(window)
    const origin = window.location.origin

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : null

      if (url === null) {
        return originalFetch(input, init)
      }

      // Resolve against `origin` rather than a startsWith() check — a plain
      // string-prefix test treats protocol-relative URLs like
      // "//evil.example.com/x" as same-origin (they also start with "/"),
      // which would attach the live auth token to a third-party request.
      const isSameOrigin = new URL(url, origin).origin === origin
      if (!isSameOrigin) {
        return originalFetch(input, init)
      }

      const urlWithToken = appendToken(url, getAuthToken())
      const response = await originalFetch(urlWithToken, init)
      const freshToken = response.headers.get('x-auth-token')
      if (freshToken) setAuthToken(freshToken)
      return response
    }
  }, [initialToken])

  return null
}
```

- [ ] **Step 3: Create AuthLink.tsx**

```tsx
// src/components/AuthLink.tsx
import Link from 'next/link'
import type { ComponentProps } from 'react'
import { appendToken } from '@/lib/auth-token'

type AuthLinkProps = ComponentProps<typeof Link> & { token: string }

export default function AuthLink({ href, token, ...rest }: AuthLinkProps) {
  // Fail loudly at dev-time rather than silently dropping the auth token:
  // a UrlObject href would otherwise pass through untouched, and the token
  // loss only surfaces later as an unexplained 403 for a real user.
  if (typeof href !== 'string') {
    throw new Error('AuthLink requires a string href so the auth token can be appended; got an object href instead.')
  }
  const finalHref = appendToken(href, token)
  return <Link href={finalHref} {...rest} />
}
```

- [ ] **Step 4: Create useAuthRouter.ts**

```typescript
// src/lib/useAuthRouter.ts
'use client'

import { useRouter } from 'next/navigation'
import { getAuthToken, appendToken } from '@/lib/auth-token'

export function useAuthRouter() {
  const router = useRouter()
  return {
    push: (href: string) => router.push(appendToken(href, getAuthToken())),
    replace: (href: string) => router.replace(appendToken(href, getAuthToken())),
  }
}
```

- [ ] **Step 5: Create auth-redirect.ts**

```typescript
// src/lib/auth-redirect.ts
import { redirect } from 'next/navigation'
import { makeSessionToken } from '@/lib/shopify-auth'
import { appendToken } from '@/lib/auth-token'

// For redirect() calls inside Server Actions (e.g. after creating a group)
// — the client can't intercept these, so a fresh token is minted directly.
export async function redirectWithToken(path: string): Promise<never> {
  const shop = process.env.SHOPIFY_SHOP
  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (shop && secret) {
    const token = await makeSessionToken(shop, secret)
    redirect(appendToken(path, token))
  }
  redirect(path)
}
```

- [ ] **Step 6: Update layout.tsx to mount AuthTokenInit and read the token**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import AuthTokenInit from "@/components/AuthTokenInit";
import packageJson from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkly Tails — Tiered Pricing",
  description: "Volume pricing admin",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authToken = (await headers()).get("x-auth-token") ?? "";

  return (
    <html lang="en">
      <body>
        <AuthTokenInit initialToken={authToken} />
        <div className="text-xs text-gray-400 text-right px-4 pt-1">
          v{packageJson.version}
        </div>
        {children}
      </body>
    </html>
  );
}
```

The version badge reads `package.json` directly (not a hardcoded string), so it automatically shows whatever value each later task's version bump commits — this is the app-wide "displayed in the app UI" requirement from the Global Constraints, satisfied once here rather than repeated per page.

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 8: Run lint to confirm the AuthLink rule is active**

```bash
npm run lint
```

Expected: no errors (nothing yet imports `next/link` outside `AuthLink.tsx`).

- [ ] **Step 9: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth-token.ts src/lib/auth-redirect.ts src/lib/useAuthRouter.ts src/components/AuthTokenInit.tsx src/components/AuthLink.tsx src/app/layout.tsx package.json
git commit -m "Add stateless token plumbing, AuthLink, root layout, and version badge"
```

---

### Task 4: Shopify GraphQL client

**Files:**
- Create: `src/lib/shopify-client.ts`
- Test: `tests/lib/shopify-client.test.ts`

**Interfaces:**
- Consumes: `SHOPIFY_SHOP`, `SHOPIFY_ACCESS_TOKEN` env vars
- Produces: `shopifyQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T>` — used by `metafields.ts` (Task 5) and `shopify-discounts.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/shopify-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'

describe('shopifyQuery', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test-shop.myshopify.com'
    process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('posts the query with the access token header and returns data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { shop: { name: 'Sparkly Tails' } } }),
    }) as unknown as typeof fetch

    const result = await shopifyQuery<{ shop: { name: string } }>(
      'query { shop { name } }',
    )

    expect(result.shop.name).toBe('Sparkly Tails')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-shop.myshopify.com/admin/api/2025-10/graphql.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Shopify-Access-Token': 'shpat_test_token',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('throws when Shopify returns errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ errors: [{ message: 'Field does not exist' }] }),
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { bogus }')).rejects.toThrow('Field does not exist')
  })

  it('throws a diagnosable error when the response body is not valid JSON', async () => {
    // Simulates a gateway/proxy error page (e.g. a 502 returning HTML)
    // instead of Shopify's own JSON — must not crash with a bare
    // cryptic SyntaxError.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0')
      },
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { shop { name } }')).rejects.toThrow(/HTTP 502/)
  })

  it('throws a diagnosable error for a non-2xx response with a JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ message: 'Exceeded rate limit' }),
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { shop { name } }')).rejects.toThrow(/HTTP 429/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/shopify-client.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/shopify-client'`.

- [ ] **Step 3: Write shopify-client.ts**

```typescript
// src/lib/shopify-client.ts
const SHOPIFY_API_VERSION = '2025-10'

function apiUrl(): string {
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not set')
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
}

function accessToken(): string {
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not set')
  return token
}

export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })

  // Shopify (or the proxy/gateway in front of it) can return a non-JSON
  // body on real failure paths — an HTML error page on a 502, plain text
  // on some 429s. Without this, res.json() throws a bare native
  // SyntaxError with no HTTP status and no indication the failure came
  // from Shopify at all, and every caller of this module inherits that
  // opacity.
  let json: { data?: T; errors?: unknown }
  try {
    json = await res.json()
  } catch (err) {
    throw new Error(
      `Shopify API returned a non-JSON response (HTTP ${res.status} ${res.statusText}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Shopify API error (HTTP ${res.status}): ${JSON.stringify(json)}`)
  }

  if (json.errors) {
    throw new Error(
      Array.isArray(json.errors)
        ? json.errors.map((e: { message: string }) => e.message).join('; ')
        : JSON.stringify(json.errors),
    )
  }
  return json.data as T
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/shopify-client.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shopify-client.ts tests/lib/shopify-client.test.ts package.json
git commit -m "Add Shopify Admin GraphQL client"
```

---

### Task 5: Metafield read/write layer

**Files:**
- Create: `src/lib/metafields.ts`
- Test: `tests/lib/metafields.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from `@/lib/shopify-client` (Task 4)
- Produces:
  - `type TierGroup = { id: string; name: string; status: 'draft' | 'live'; tiers: { minQty: number; percentOff: number }[]; productIds: string[]; discountIds: Record<string, Record<string, string>> }`
  - `type Config = { groups: TierGroup[] }`
  - `getConfig(): Promise<Config>`
  - `saveConfig(config: Config): Promise<void>`
  - `syncProductTiers(productId: string, productTiers: DenormalisedProductTier | null): Promise<void>` — used by Task 12's `setGroupStatus` to keep `product.sparkly_tiers.tiers` denormalised data current, with real per-product prices computed via Task 9's `getProductInfo` and Task 6's `resultingPrice`.

  These types are the single definition every later task imports — do not redeclare `TierGroup` or `Config` anywhere else.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/metafields.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, type Config } from '@/lib/metafields'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an empty config when the metafield does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: null },
    })

    const config = await getConfig()
    expect(config).toEqual({ groups: [] })
  })

  it('parses an existing config metafield', async () => {
    const stored: Config = {
      groups: [
        {
          id: 'grp_1',
          name: 'Standard',
          status: 'live',
          tiers: [{ minQty: 5, percentOff: 14.7 }],
          productIds: ['gid://shopify/Product/1'],
          discountIds: {},
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })

    const config = await getConfig()
    expect(config).toEqual(stored)
  })
})

describe('saveConfig', () => {
  it('writes the config as a JSON metafield via metafieldsSet', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    const config: Config = { groups: [] }
    await saveConfig(config)

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: expect.arrayContaining([
          expect.objectContaining({
            namespace: 'sparkly_tiers',
            key: 'config',
            type: 'json',
            value: JSON.stringify(config),
          }),
        ]),
      }),
    )
  })

  it('throws if Shopify reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'too long' }] },
    })

    await expect(saveConfig({ groups: [] })).rejects.toThrow('too long')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/metafields.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/metafields'`.

- [ ] **Step 3: Write metafields.ts**

```typescript
// src/lib/metafields.ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff: number
}

export interface TierGroup {
  id: string
  name: string
  status: 'draft' | 'live'
  tiers: Tier[]
  productIds: string[]
  // productId → threshold (as string, e.g. "5") → DiscountAutomaticNode gid
  discountIds: Record<string, Record<string, string>>
}

export interface Config {
  groups: TierGroup[]
}

const NAMESPACE = 'sparkly_tiers'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { groups: [] }
  }

  return JSON.parse(data.shop.metafield.value) as Config
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}

export interface DenormalisedProductTier {
  groupId: string
  basePrice: string
  tiers: { minQty: number; unitPrice: string }[]
}

/**
 * Rewrites the product's own tier metafield so the storefront widget (a
 * separate Phase 2 project) can render tiers in Liquid with no API call.
 * Called by setGroupStatus (Task 12) after every config change, using the
 * product's real base price (Task 9) and tier-math's resultingPrice (Task 6)
 * to compute basePrice/unitPrice — never a placeholder.
 * Pass `productTiers: null` to clear a product's tiers (e.g. when it's
 * removed from a group).
 */
export async function syncProductTiers(
  productId: string,
  productTiers: DenormalisedProductTier | null,
): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'tiers',
          type: 'json',
          value: JSON.stringify(productTiers ?? {}),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/metafields.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/metafields.ts tests/lib/metafields.test.ts package.json
git commit -m "Add metafield read/write layer for tier config"
```

---

### Task 6: Pure pricing math (`tier-math`)

This is the task with the highest money-bug risk in the whole plan — see the spec's callout on `percentOff` (percentage) vs Shopify's `percentage` field (fraction). Test the conversion explicitly; do not let it hide inside a bigger function.

**Files:**
- Create: `src/lib/tier-math.ts`
- Test: `tests/lib/tier-math.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces:
  - `percentOffFromTargetPrice(basePrice: number, targetPrice: number): number` — returns a **percentage** (e.g. `14.7`), rounded to 1 decimal place
  - `resultingPrice(basePrice: number, percentOff: number): number` — returns the actual price after Shopify-style rounding (2 decimal places, standard rounding), given a **percentage**
  - `percentageToShopifyFraction(percentOff: number): number` — the ONLY place `percentOff / 100` happens; returns a fraction like `0.147` for use in `customerGets.value.percentage`
  - These three functions are what Task 7 (reconciler) and Task 12 (admin UI) both call — never recompute this math elsewhere.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/tier-math.test.ts
import { describe, it, expect } from 'vitest'
import {
  percentOffFromTargetPrice,
  resultingPrice,
  percentageToShopifyFraction,
} from '@/lib/tier-math'

describe('percentOffFromTargetPrice', () => {
  it('computes the percent off needed to go from £1.70 to £1.45', () => {
    // (1.70 - 1.45) / 1.70 * 100 = 14.705882... → rounds to 14.7
    expect(percentOffFromTargetPrice(1.70, 1.45)).toBe(14.7)
  })

  it('computes 0% when target equals base price', () => {
    expect(percentOffFromTargetPrice(1.70, 1.70)).toBe(0)
  })
})

describe('resultingPrice', () => {
  it('applies 14.7% off £1.70 and rounds to 2 decimal places', () => {
    // 1.70 * (1 - 0.147) = 1.4501 → rounds to 1.45
    expect(resultingPrice(1.70, 14.7)).toBe(1.45)
  })

  it('returns the base price unchanged at 0% off', () => {
    expect(resultingPrice(1.70, 0)).toBe(1.70)
  })

  it('rounds up when the third decimal is 5 or more', () => {
    // 1.70 * (1 - 0.176) = 1.4008 → rounds to 1.40
    expect(resultingPrice(1.70, 17.6)).toBe(1.40)
  })
})

describe('percentageToShopifyFraction', () => {
  it('converts a stored percentage (14.7) to the fraction Shopify expects (0.147)', () => {
    expect(percentageToShopifyFraction(14.7)).toBeCloseTo(0.147, 10)
  })

  it('converts 100% to 1.0', () => {
    expect(percentageToShopifyFraction(100)).toBe(1)
  })

  it('converts 0% to 0', () => {
    expect(percentageToShopifyFraction(0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/tier-math.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/tier-math'`.

- [ ] **Step 3: Write tier-math.ts**

```typescript
// src/lib/tier-math.ts

/**
 * Given a base price and the price you want customers to actually pay,
 * returns the percentage off (e.g. 14.7 for 14.7%) needed to get there,
 * rounded to 1 decimal place. This is a PERCENTAGE, not a fraction — see
 * percentageToShopifyFraction for the conversion Shopify's API needs.
 */
export function percentOffFromTargetPrice(
  basePrice: number,
  targetPrice: number,
): number {
  const rawPercent = ((basePrice - targetPrice) / basePrice) * 100
  return Math.round(rawPercent * 10) / 10
}

/**
 * Given a base price and a percentage off (e.g. 14.7 for 14.7%), returns
 * the actual price a customer pays, rounded to 2 decimal places using
 * standard rounding — the same rounding Shopify applies at checkout.
 */
export function resultingPrice(basePrice: number, percentOff: number): number {
  const fraction = percentageToShopifyFraction(percentOff)
  const raw = basePrice * (1 - fraction)
  return Math.round(raw * 100) / 100
}

/**
 * Converts a stored percentage (14.7, meaning 14.7%) into the fraction
 * Shopify's discountAutomaticBasicCreate customerGets.value.percentage
 * field expects (0.147). THIS IS THE ONLY PLACE THIS CONVERSION HAPPENS.
 * Config metafields always store percentages; Shopify's API always wants
 * fractions. Mixing them up is a 10x pricing error in a live discount.
 */
export function percentageToShopifyFraction(percentOff: number): number {
  return percentOff / 100
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/tier-math.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tier-math.ts tests/lib/tier-math.test.ts package.json
git commit -m "Add pure tier-math library with percent/fraction conversion"
```

---

### Task 7: Reconciler — diff desired config against actual discounts

This is a pure function with no Shopify calls. It is the core correctness guarantee of the whole app: idempotent, all-or-nothing on budget, and produces the exact action list Task 8 will execute unmodified.

**Files:**
- Create: `src/lib/reconciler.ts`
- Create: `tests/fixtures/groups.ts`
- Test: `tests/lib/reconciler.test.ts`

**Interfaces:**
- Consumes: `Config`, `TierGroup`, `Tier` from `@/lib/metafields` (Task 5); `percentageToShopifyFraction` from `@/lib/tier-math` (Task 6)
- Produces:
  ```typescript
  type ActualDiscount = {
    id: string          // gid://shopify/DiscountAutomaticNode/...
    productId: string
    minQty: number
    percentOff: number  // stored as percentage, same convention as config
  }

  type Action =
    | { type: 'create'; productId: string; minQty: number; percentOff: number; title: string }
    | { type: 'delete'; discountId: string }
    | { type: 'update'; discountId: string; percentOff: number }

  type ReconcileResult =
    | { ok: true; actions: Action[] }
    | { ok: false; reason: string }  // e.g. budget exceeded — no partial actions

  reconcile(config: Config, actual: ActualDiscount[]): ReconcileResult
  ```
  This exact shape is what Task 8's `apply()` consumes.

- [ ] **Step 1: Write the shared test fixtures**

```typescript
// tests/fixtures/groups.ts
import type { Config, TierGroup } from '@/lib/metafields'

export const standardGroup: TierGroup = {
  id: 'grp_standard',
  name: 'Standard voucher',
  status: 'live',
  tiers: [
    { minQty: 5, percentOff: 14.7 },
    { minQty: 10, percentOff: 17.6 },
  ],
  productIds: ['gid://shopify/Product/111'],
  discountIds: {},
}

export const configWithOneGroup: Config = {
  groups: [standardGroup],
}

export const emptyConfig: Config = { groups: [] }
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/lib/reconciler.test.ts
import { describe, it, expect } from 'vitest'
import { reconcile, type ActualDiscount } from '@/lib/reconciler'
import { standardGroup, configWithOneGroup, emptyConfig } from '../fixtures/groups'
import type { Config } from '@/lib/metafields'

describe('reconcile — creating from scratch', () => {
  it('creates one discount per tier per product when nothing exists yet', () => {
    const result = reconcile(configWithOneGroup, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.actions).toHaveLength(2)
    expect(result.actions).toContainEqual(
      expect.objectContaining({ type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 }),
    )
    expect(result.actions).toContainEqual(
      expect.objectContaining({ type: 'create', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 }),
    )
  })

  it('creates nothing for a draft group', () => {
    const draftConfig: Config = {
      groups: [{ ...standardGroup, status: 'draft' }],
    }
    const result = reconcile(draftConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})

describe('reconcile — idempotency', () => {
  it('produces zero actions when actual state already matches desired state', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneGroup, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})

describe('reconcile — updates and deletes', () => {
  it('emits an update when a tier percent changes', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 10.0 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneGroup, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      { type: 'update', discountId: 'gid://shopify/DiscountAutomaticNode/aaa', percentOff: 14.7 },
    ])
  })

  it('deletes a discount whose tier was removed from the group', () => {
    const configWithOneTier: Config = {
      groups: [{ ...standardGroup, tiers: [{ minQty: 5, percentOff: 14.7 }] }],
    }
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneTier, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
    ])
  })

  it('deletes all discounts for a product removed from its group', () => {
    const configNoProducts: Config = {
      groups: [{ ...standardGroup, productIds: [] }],
    }
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configNoProducts, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual(
      expect.arrayContaining([
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' },
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
      ]),
    )
    expect(result.actions).toHaveLength(2)
  })

  it('deletes all discounts for a group that goes from live to draft', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const draftConfig: Config = {
      groups: [{ ...standardGroup, status: 'draft' }],
    }
    const result = reconcile(draftConfig, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual(
      expect.arrayContaining([
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' },
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
      ]),
    )
  })
})

describe('reconcile — slot budget', () => {
  it('refuses all-or-nothing when the desired state would exceed 25 discounts', () => {
    // 13 products x 2 tiers = 26 discounts, one over budget
    const manyProductIds = Array.from({ length: 13 }, (_, i) => `gid://shopify/Product/${i}`)
    const overBudgetConfig: Config = {
      groups: [{ ...standardGroup, productIds: manyProductIds }],
    }
    const result = reconcile(overBudgetConfig, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/25/)
  })

  it('allows exactly 25 discounts', () => {
    // 12 products x 2 tiers = 24, plus 1 more product's worth counted
    // separately in a second group with 1 tier = 25 total
    const twelveProducts = Array.from({ length: 12 }, (_, i) => `gid://shopify/Product/${i}`)
    const exactBudgetConfig: Config = {
      groups: [
        { ...standardGroup, productIds: twelveProducts },
        {
          id: 'grp_extra',
          name: 'Extra',
          status: 'live',
          tiers: [{ minQty: 3, percentOff: 5 }],
          productIds: ['gid://shopify/Product/999'],
          discountIds: {},
        },
      ],
    }
    const result = reconcile(exactBudgetConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(25)
  })
})

describe('reconcile — empty config', () => {
  it('produces no actions and no error for an empty config with no actual discounts', () => {
    const result = reconcile(emptyConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})

describe('reconcile — duplicate desired across groups', () => {
  it('refuses when the same product+threshold is desired by two different live groups', () => {
    // Nothing prevents a product from being pasted into two groups'
    // product lists (Task 12's free-text assignment has no cross-group
    // check), so this is reachable through normal use, not just
    // hypothetical drift.
    const conflictingConfig: Config = {
      groups: [
        standardGroup, // live, product 111, tiers 5+/10+
        {
          id: 'grp_holiday',
          name: 'Holiday Special',
          status: 'live',
          tiers: [{ minQty: 5, percentOff: 25 }],
          productIds: ['gid://shopify/Product/111'],
          discountIds: {},
        },
      ],
    }
    const result = reconcile(conflictingConfig, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/Standard voucher/)
    expect(result.reason).toMatch(/Holiday Special/)
  })
})

describe('reconcile — duplicate actual (drift)', () => {
  it('deletes orphaned duplicate discounts for the same product+threshold, keeping one reconciled', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/orphan', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneGroup, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/orphan' },
    ])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/lib/reconciler.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/reconciler'`.

- [ ] **Step 4: Write reconciler.ts**

```typescript
// src/lib/reconciler.ts
import type { Config, TierGroup } from '@/lib/metafields'

export interface ActualDiscount {
  id: string
  productId: string
  minQty: number
  percentOff: number
}

export type Action =
  | { type: 'create'; productId: string; minQty: number; percentOff: number; title: string }
  | { type: 'delete'; discountId: string }
  | { type: 'update'; discountId: string; percentOff: number }

export type ReconcileResult =
  | { ok: true; actions: Action[] }
  | { ok: false; reason: string }

const MAX_ACTIVE_DISCOUNTS = 25

interface DesiredDiscount {
  productId: string
  minQty: number
  percentOff: number
  title: string
  groupName: string
}

function desiredDiscountsForGroup(group: TierGroup): DesiredDiscount[] {
  if (group.status !== 'live') return []

  const desired: DesiredDiscount[] = []
  for (const productId of group.productIds) {
    for (const tier of group.tiers) {
      desired.push({
        productId,
        minQty: tier.minQty,
        percentOff: tier.percentOff,
        title: `Tiers: ${group.name} — ${productId} — ${tier.minQty}+`,
        groupName: group.name,
      })
    }
  }
  return desired
}

function key(productId: string, minQty: number): string {
  return `${productId}::${minQty}`
}

/**
 * Diffs the desired config against Shopify's actual automatic discounts and
 * returns the exact set of create/update/delete actions needed to bring
 * Shopify in line. Pure — no Shopify calls. Idempotent: calling this again
 * with `actual` already matching `config` returns an empty action list.
 *
 * All-or-nothing on two conditions, either of which returns { ok: false }
 * with NO actions at all rather than a partial list:
 *   1. The 25-discount budget (across every live group combined).
 *   2. The same product+threshold desired by more than one live group —
 *      a product's tiers must come from exactly one live group at a time.
 *      Without this check, one group's discount would silently overwrite
 *      the other's in the diff (both map to the same Shopify discount
 *      slot), with no error. Nothing upstream of this function currently
 *      prevents that overlap from being configured, so this is the one
 *      place it's caught.
 *
 * Self-healing extends to duplicate ACTUAL discounts too: if Shopify ever
 * has more than one discount node for the same product+threshold (manual
 * admin tampering, or drift from a past partial failure), every duplicate
 * beyond the first is deleted as an orphan — otherwise it would be
 * permanently invisible to the diff and silently consume the 25-discount
 * budget forever.
 */
export function reconcile(config: Config, actual: ActualDiscount[]): ReconcileResult {
  const allDesired = config.groups.flatMap(desiredDiscountsForGroup)

  const desiredGroupsByKey = new Map<string, DesiredDiscount[]>()
  for (const d of allDesired) {
    const k = key(d.productId, d.minQty)
    const existing = desiredGroupsByKey.get(k)
    if (existing) {
      existing.push(d)
    } else {
      desiredGroupsByKey.set(k, [d])
    }
  }

  for (const entries of desiredGroupsByKey.values()) {
    if (entries.length > 1) {
      const groupNames = [...new Set(entries.map((e) => e.groupName))]
      return {
        ok: false,
        reason: `Product ${entries[0].productId} at ${entries[0].minQty}+ is configured in more than one live group (${groupNames.join(', ')}). A product's tiers must come from exactly one live group at a time.`,
      }
    }
  }

  if (allDesired.length > MAX_ACTIVE_DISCOUNTS) {
    return {
      ok: false,
      reason: `Desired configuration requires ${allDesired.length} automatic discounts, exceeding Shopify's limit of ${MAX_ACTIVE_DISCOUNTS} active discounts per store.`,
    }
  }

  const desiredByKey = new Map(allDesired.map((d) => [key(d.productId, d.minQty), d]))

  const actualGroupsByKey = new Map<string, ActualDiscount[]>()
  for (const a of actual) {
    const k = key(a.productId, a.minQty)
    const existing = actualGroupsByKey.get(k)
    if (existing) {
      existing.push(a)
    } else {
      actualGroupsByKey.set(k, [a])
    }
  }

  const actions: Action[] = []

  for (const [k, desired] of desiredByKey) {
    const existing = actualGroupsByKey.get(k)?.[0]
    if (!existing) {
      actions.push({
        type: 'create',
        productId: desired.productId,
        minQty: desired.minQty,
        percentOff: desired.percentOff,
        title: desired.title,
      })
    } else if (existing.percentOff !== desired.percentOff) {
      actions.push({
        type: 'update',
        discountId: existing.id,
        percentOff: desired.percentOff,
      })
    }
  }

  for (const [k, entries] of actualGroupsByKey) {
    if (!desiredByKey.has(k)) {
      for (const entry of entries) {
        actions.push({ type: 'delete', discountId: entry.id })
      }
    } else if (entries.length > 1) {
      // First entry was already reconciled against desired above; every
      // duplicate beyond it is an orphan.
      for (const orphan of entries.slice(1)) {
        actions.push({ type: 'delete', discountId: orphan.id })
      }
    }
  }

  return { ok: true, actions }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/lib/reconciler.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reconciler.ts tests/fixtures/groups.ts tests/lib/reconciler.test.ts package.json
git commit -m "Add pure reconciler: diff desired config against actual discounts"
```

---

### Task 8: Execute reconciler actions against Shopify

**Files:**
- Create: `src/lib/shopify-discounts.ts`
- Test: `tests/lib/shopify-discounts.test.ts`

**Interfaces:**
- Consumes: `Action` from `@/lib/reconciler` (Task 7); `percentageToShopifyFraction` from `@/lib/tier-math` (Task 6); `shopifyQuery` from `@/lib/shopify-client` (Task 4)
- Produces:
  - `listActualDiscounts(): Promise<ActualDiscount[]>` — queries Shopify for all discounts this app manages (identified by title prefix `Tiers: `)
  - `applyActions(actions: Action[]): Promise<Map<string, string>>` — executes each action, returns a map of `create` actions' `key(productId, minQty)` → newly created discount gid, so the caller can update `Config.groups[].discountIds`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/shopify-discounts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listActualDiscounts, applyActions } from '@/lib/shopify-discounts'
import * as shopifyClient from '@/lib/shopify-client'
import type { Action } from '@/lib/reconciler'

describe('listActualDiscounts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses discounts with the "Tiers: " title prefix into ActualDiscount shape', async () => {
    // Mock shape matches what the query's `productsToAdd: products` alias
    // actually returns — a connection (edges/node), directly under `items`,
    // not a flat array nested under a `products` object. A mismatched mock
    // here would hide the exact bug this test exists to catch.
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/aaa',
              automaticDiscount: {
                title: 'Tiers: Standard voucher — gid://shopify/Product/111 — 5+',
                minimumRequirement: { greaterThanOrEqualToQuantity: '5' },
                customerGets: {
                  value: { percentage: 0.147 },
                  items: { productsToAdd: { edges: [{ node: { id: 'gid://shopify/Product/111' } }] } },
                },
              },
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([
      {
        id: 'gid://shopify/DiscountAutomaticNode/aaa',
        productId: 'gid://shopify/Product/111',
        minQty: 5,
        percentOff: 14.7,
      },
    ])
  })

  it('ignores discounts not created by this app', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/zzz',
              automaticDiscount: { title: 'BFCM 20% off everything' },
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([])
  })

  it('skips a discount node whose type is not DiscountAutomaticBasic, rather than crashing', async () => {
    // Simulates a free-shipping (or other non-Basic) automatic discount in
    // the store: the query's `... on DiscountAutomaticBasic` fragment
    // contributes no fields for a node of a different resolved type, so
    // `automaticDiscount` comes back with no `title` at all — not because a
    // real Basic discount can lack one.
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/free-ship',
              automaticDiscount: {},
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([])
  })
})

describe('applyActions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates a discount and returns its gid keyed by productId::minQty', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticBasicCreate: {
        automaticDiscountNode: { id: 'gid://shopify/DiscountAutomaticNode/new1' },
        userErrors: [],
      },
    })

    const actions: Action[] = [
      { type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7, title: 'Tiers: Standard — 111 — 5+' },
    ]
    const result = await applyActions(actions)
    expect(result.get('gid://shopify/Product/111::5')).toBe('gid://shopify/DiscountAutomaticNode/new1')
  })

  it('throws if Shopify reports userErrors on create', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticBasicCreate: {
        automaticDiscountNode: null,
        userErrors: [{ field: ['title'], message: 'Title already taken' }],
      },
    })

    const actions: Action[] = [
      { type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7, title: 'Tiers: dup' },
    ]
    await expect(applyActions(actions)).rejects.toThrow('Title already taken')
  })

  it('deletes a discount by id', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticDelete: { userErrors: [] },
    })

    await applyActions([{ type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' }])

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticDelete'),
      expect.objectContaining({ id: 'gid://shopify/DiscountAutomaticNode/aaa' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/shopify-discounts.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/shopify-discounts'`.

- [ ] **Step 3: Write shopify-discounts.ts**

```typescript
// src/lib/shopify-discounts.ts
import { shopifyQuery } from '@/lib/shopify-client'
import { percentageToShopifyFraction } from '@/lib/tier-math'
import type { Action, ActualDiscount } from '@/lib/reconciler'

const TITLE_PREFIX = 'Tiers: '

interface RawDiscountNode {
  id: string
  automaticDiscount: {
    // No fields here are guaranteed present: the `... on DiscountAutomaticBasic`
    // fragment in the query below only contributes fields when the node's
    // resolved type actually IS DiscountAutomaticBasic. Any other automatic
    // discount type in the store (this app never creates one, but a human
    // could, e.g. a free-shipping promo) comes back as an empty object here —
    // not because a real Basic discount can lack a title, but because the
    // fragment didn't match. Treat every field as optional and skip nodes
    // that don't parse, rather than assuming shape.
    title?: string
    minimumRequirement?: { greaterThanOrEqualToQuantity?: string } | null
    customerGets?: {
      value: { percentage?: number }
      // Matches the query's `productsToAdd: products` alias directly under
      // `items` — a real GraphQL connection (edges/node), not a flat array.
      items: { productsToAdd?: { edges: { node: { id: string } }[] } }
    } | null
  }
}

function parseDiscount(node: RawDiscountNode): ActualDiscount | null {
  const { title, minimumRequirement, customerGets } = node.automaticDiscount
  if (!title || !title.startsWith(TITLE_PREFIX)) return null

  const minQty = minimumRequirement?.greaterThanOrEqualToQuantity
  const percentage = customerGets?.value.percentage
  const productId = customerGets?.items.productsToAdd?.edges?.[0]?.node.id

  if (!minQty || percentage === undefined || !productId) return null

  return {
    id: node.id,
    productId,
    minQty: parseInt(minQty, 10),
    percentOff: Math.round(percentage * 1000) / 10, // fraction -> percentage, 1dp
  }
}

/** Fetches all automatic discounts this app manages (identified by title prefix). */
export async function listActualDiscounts(): Promise<ActualDiscount[]> {
  const data = await shopifyQuery<{
    automaticDiscountNodes: { edges: { node: RawDiscountNode }[] }
  }>(
    `query listDiscounts {
      automaticDiscountNodes(first: 250) {
        edges {
          node {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title
                minimumRequirement {
                  ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
                }
                customerGets {
                  value { ... on DiscountPercentage { percentage } }
                  items { ... on DiscountProducts { productsToAdd: products { edges { node { id } } } } }
                }
              }
            }
          }
        }
      }
    }`,
  )

  return data.automaticDiscountNodes.edges
    .map((e) => parseDiscount(e.node))
    .filter((d): d is ActualDiscount => d !== null)
}

async function createDiscount(action: Extract<Action, { type: 'create' }>): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticBasicCreate: {
      automaticDiscountNode: { id: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTierDiscount($input: DiscountAutomaticBasicInput!) {
      discountAutomaticBasicCreate(automaticBasicDiscount: $input) {
        automaticDiscountNode { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: action.title,
        startsAt: new Date().toISOString(),
        minimumRequirement: {
          quantity: { greaterThanOrEqualToQuantity: String(action.minQty) },
        },
        customerGets: {
          value: { percentage: percentageToShopifyFraction(action.percentOff) },
          items: { products: { productsToAdd: [action.productId] } },
        },
        combinesWith: {
          productDiscounts: false,
          orderDiscounts: true,
          shippingDiscounts: true,
        },
      },
    },
  )

  const { automaticDiscountNode, userErrors } = data.discountAutomaticBasicCreate
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join('; '))
  }
  return automaticDiscountNode!.id
}

async function updateDiscount(action: Extract<Action, { type: 'update' }>): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticBasicUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTierDiscount($id: ID!, $input: DiscountAutomaticBasicInput!) {
      discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: action.discountId,
      input: {
        customerGets: {
          value: { percentage: percentageToShopifyFraction(action.percentOff) },
        },
      },
    },
  )

  if (data.discountAutomaticBasicUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticBasicUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

async function deleteDiscount(action: Extract<Action, { type: 'delete' }>): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTierDiscount($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: action.discountId },
  )

  if (data.discountAutomaticDelete.userErrors.length > 0) {
    throw new Error(data.discountAutomaticDelete.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * Executes reconciler actions in order. Returns a map of
 * "productId::minQty" -> newly created discount gid, for `create` actions
 * only, so the caller can update Config.groups[].discountIds.
 */
export async function applyActions(actions: Action[]): Promise<Map<string, string>> {
  const created = new Map<string, string>()

  for (const action of actions) {
    if (action.type === 'create') {
      const id = await createDiscount(action)
      created.set(`${action.productId}::${action.minQty}`, id)
    } else if (action.type === 'update') {
      await updateDiscount(action)
    } else {
      await deleteDiscount(action)
    }
  }

  return created
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/shopify-discounts.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests across all files pass (shopify-auth, shopify-client, metafields, tier-math, reconciler, shopify-discounts).

- [ ] **Step 6: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shopify-discounts.ts tests/lib/shopify-discounts.test.ts package.json
git commit -m "Add Shopify discount execution layer"
```

---

### Task 9: Product price lookup

Real per-product prices matter because target prices are entered as percent-off (Task 6), and the resulting price only means something once it's applied to a product's actual Shopify price — never a stand-in example. This task is what lets Task 12 replace an example/placeholder price with the real one.

**Files:**
- Create: `src/lib/products.ts`
- Test: `tests/lib/products.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from `@/lib/shopify-client` (Task 4)
- Produces: `getProductInfo(productId: string): Promise<{ title: string; basePrice: number } | null>` — returns `null` if the product doesn't exist (e.g. a stale/typo'd gid in a group's product list). Used by Task 12's `setGroupStatus` and its group editor page to compute real per-product resulting prices. Assumes a single-variant product (the first variant's price) — consistent with this app's per-product tier scoping (spec §2.3). Multi-variant tiering is out of scope for Phase 1.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/products.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProductInfo } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('getProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title and base price parsed from the first variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        title: 'Chicken Voucher',
        variants: { edges: [{ node: { price: '1.70' } }] },
      },
    })

    const result = await getProductInfo('gid://shopify/Product/111')
    expect(result).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
  })

  it('returns null when the product does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })

    const result = await getProductInfo('gid://shopify/Product/999')
    expect(result).toBeNull()
  })

  it('returns null when the product has no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: { title: 'Empty Product', variants: { edges: [] } },
    })

    const result = await getProductInfo('gid://shopify/Product/222')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/products.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/products'`.

- [ ] **Step 3: Write products.ts**

```typescript
// src/lib/products.ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductInfo {
  title: string
  basePrice: number
}

/**
 * Fetches a product's title and real base price (the first variant's
 * price). Assumes a single-variant product — consistent with this app's
 * per-product tier scoping (spec §2.3); multi-variant tiering is out of
 * scope for Phase 1. Returns null if the product doesn't exist or has no
 * variants, so callers (Task 12) can skip a stale product id rather than
 * crash.
 */
export async function getProductInfo(productId: string): Promise<ProductInfo | null> {
  const data = await shopifyQuery<{
    product: {
      title: string
      variants: { edges: { node: { price: string } }[] }
    } | null
  }>(
    `query getProductInfo($id: ID!) {
      product(id: $id) {
        title
        variants(first: 1) {
          edges { node { price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return null
  const firstVariant = data.product.variants.edges[0]?.node
  if (!firstVariant) return null

  return {
    title: data.product.title,
    basePrice: parseFloat(firstVariant.price),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/products.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Bump APP_VERSION**

Infrastructure task — bump the **patch** number: read the current `"version"` in `package.json` and increment its third segment by 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/products.ts tests/lib/products.test.ts package.json
git commit -m "Add product price lookup for real per-product tier pricing"
```

---

### Task 10: Groups list page (admin home)

**Files:**
- Create: `src/app/page.tsx` (replaces Task 1 placeholder)

**Interfaces:**
- Consumes: `getConfig` from `@/lib/metafields` (Task 5); `AuthLink` from `@/components/AuthLink` (Task 3)
- Produces: the app's home route, linked to by nothing yet (it's the root) but linking to `/groups/new` (Task 11) and `/groups/[groupId]` (Task 12)

- [ ] **Step 1: Write the page**

```tsx
// src/app/page.tsx
import { headers } from 'next/headers'
import { getConfig } from '@/lib/metafields'
import AuthLink from '@/components/AuthLink'

const MAX_ACTIVE_DISCOUNTS = 25

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const slotsUsed = config.groups
    .filter((g) => g.status === 'live')
    .reduce((sum, g) => sum + g.tiers.length * g.productIds.length, 0)

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Tiered Pricing</h1>
        <AuthLink
          href="/groups/new"
          token={token}
          className="bg-black text-white px-4 py-2 rounded"
        >
          New group
        </AuthLink>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} discount slots used
      </p>

      {config.groups.length === 0 ? (
        <p className="text-gray-500">No tier groups yet.</p>
      ) : (
        <ul className="divide-y">
          {config.groups.map((group) => (
            <li key={group.id} className="py-4">
              <AuthLink href={`/groups/${group.id}`} token={token} className="font-medium hover:underline">
                {group.name}
              </AuthLink>
              <p className="text-sm text-gray-500">
                {group.status} · {group.tiers.length} tiers · {group.productIds.length} products
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`. Note: this will attempt to call `getConfig()` at build time only if the route is statically analysed — since it reads `headers()`, Next.js will correctly mark it as dynamic and defer execution to request time, so a missing `SHOPIFY_ACCESS_TOKEN` at build time is not an error here.

- [ ] **Step 3: Bump APP_VERSION**

This is the first user-facing feature (the admin app's home page) — bump the **minor** number: read the current `"version"` in `package.json`, increment its second segment by 1, and reset the third segment to `0` (e.g. `0.1.8` → `0.2.0`).

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx package.json
git commit -m "Add tier groups list page"
```

---

### Task 11: Create group Server Action + form

**Files:**
- Create: `src/actions/groupActions.ts`
- Create: `src/app/groups/new/page.tsx`

**Interfaces:**
- Consumes: `getConfig`, `saveConfig`, `type TierGroup` from `@/lib/metafields` (Task 5); `redirectWithToken` from `@/lib/auth-redirect` (Task 3)
- Produces: `createGroup(formData: FormData): Promise<void>` — a Server Action, exported for reuse by Task 12's tests if needed. Groups are created in `status: 'draft'` — reconciliation only happens when a group goes live (Task 12).

- [ ] **Step 1: Write groupActions.ts with the create action**

```typescript
// src/actions/groupActions.ts
'use server'

import { getConfig, saveConfig, type TierGroup, type Tier } from '@/lib/metafields'
import { redirectWithToken } from '@/lib/auth-redirect'
import { randomUUID } from 'crypto'

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
    // Round to 1 decimal place — Shopify's stored fraction only round-trips
    // back to 1dp (shopify-discounts.ts's parseDiscount does
    // `Math.round(percentage * 1000) / 10`), so a value with more precision
    // here would never match on the next reconcile, defeating idempotency
    // with a spurious 'update' action every time Go live runs.
    const percentOff = Math.round(rawPercentOff * 10) / 10
    if (minQty > 0 && percentOff >= 0) {
      tiers.push({ minQty, percentOff })
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
}

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Group name is required')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()

  const newGroup: TierGroup = {
    id: `grp_${randomUUID()}`,
    name,
    status: 'draft',
    tiers,
    productIds: [],
    discountIds: {},
  }

  await saveConfig({ groups: [...config.groups, newGroup] })

  await redirectWithToken(`/groups/${newGroup.id}`)
}
```

- [ ] **Step 2: Write the new-group form page**

```tsx
// src/app/groups/new/page.tsx
import { createGroup } from '@/actions/groupActions'

export default function NewGroupPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New tier group</h1>

      <form action={createGroup} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Standard voucher"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  name={`tier-${i}-minQty`}
                  type="number"
                  min="1"
                  placeholder="Min qty (e.g. 5)"
                  className="border rounded px-3 py-2 w-40"
                />
                <span className="text-sm text-gray-500">+ units →</span>
                <input
                  name={`tier-${i}-percentOff`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="% off (e.g. 14.7)"
                  className="border rounded px-3 py-2 w-40"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price for each assigned product before you save.
          </p>
        </div>

        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          Create draft group
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 4: Bump APP_VERSION**

User-facing feature — bump the **minor** number: read the current `"version"` in `package.json`, increment its second segment by 1, and reset the third segment to `0`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/groupActions.ts src/app/groups/new/page.tsx package.json
git commit -m "Add create-group Server Action and form"
```

---

### Task 12: Group editor — product assignment, slot meter, go-live reconciliation, real per-product prices

This is where the reconciler (Task 7), executor (Task 8), and product price lookup (Task 9) actually get invoked from the UI for the first time. Going live runs `reconcile()` then `applyActions()`, then writes the returned discount ids back into `Config` and calls `syncProductTiers` for every affected product — using each product's real Shopify price, never a placeholder.

**Files:**
- Modify: `src/actions/groupActions.ts` (add `updateGroup`, `assignProducts`, `setGroupStatus`)
- Create: `src/app/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5, 6, 7, 8, 9, plus `createGroup` context from Task 11
- Produces: `setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void>` — the function that performs reconciliation; this is the end of the Phase 1 chain, nothing later consumes it within this plan (Phase 2's storefront widget reads `product.sparkly_tiers.tiers` directly, written by this action via `syncProductTiers`)

- [ ] **Step 1: Add the remaining Server Actions to groupActions.ts**

Append to `src/actions/groupActions.ts` (the file created in Task 10):

```typescript
// --- append to src/actions/groupActions.ts ---

import { reconcile } from '@/lib/reconciler'
import { listActualDiscounts, applyActions } from '@/lib/shopify-discounts'
import { syncProductTiers, type Config } from '@/lib/metafields'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfo } from '@/lib/products'

/**
 * Runs the reconciler against `config` and, if it succeeds, applies the
 * resulting Shopify actions, updates discountIds bookkeeping, saves the
 * config, and syncs `group`'s product tier metafields with real
 * per-product prices (never a placeholder). Throws with the reconciler's
 * `reason` on failure (25-discount budget exceeded, or the same
 * product+threshold desired by more than one live group) — nothing is
 * persisted on failure, and the caller is responsible for reverting
 * whatever change it made to `config` before calling this, so a failed
 * attempt never leaves the saved config diverged from real Shopify state.
 *
 * Shared by both `assignProducts` and `setGroupStatus`: editing a live
 * group's product list is exactly as consequential as flipping it live in
 * the first place (it changes what Shopify has real discounts for), so it
 * must go through the identical reconcile-and-apply path rather than only
 * touching config — otherwise the UI could show a product as "live" with
 * a computed price while no discount for it actually exists in Shopify.
 */
async function reconcileAndSync(config: Config, group: TierGroup): Promise<void> {
  const actual = await listActualDiscounts()
  const result = reconcile(config, actual)

  if (!result.ok) {
    throw new Error(result.reason)
  }

  const createdIds = await applyActions(result.actions)

  // Update discountIds for every product in every group with the newly
  // created discount gids, and remove entries for anything deleted.
  const deletedIds = new Set(
    result.actions.filter((a) => a.type === 'delete').map((a) => a.discountId),
  )
  for (const g of config.groups) {
    for (const productId of Object.keys(g.discountIds)) {
      for (const minQty of Object.keys(g.discountIds[productId])) {
        if (deletedIds.has(g.discountIds[productId][minQty])) {
          delete g.discountIds[productId][minQty]
        }
      }
    }
  }
  for (const [k, discountId] of createdIds) {
    const [productId, minQtyStr] = k.split('::')
    const targetGroup = config.groups.find((g) => g.productIds.includes(productId))
    if (targetGroup) {
      targetGroup.discountIds[productId] ??= {}
      targetGroup.discountIds[productId][minQtyStr] = discountId
    }
  }

  await saveConfig(config)

  // Rewrite the denormalised per-product metafield for every product in
  // the group, using each product's REAL base price (Task 9) and
  // tier-math's resultingPrice (Task 6) — never a placeholder. If a
  // product id is stale (getProductInfo returns null — e.g. a deleted
  // product or a typo'd gid pasted into the product list), that single
  // product's metafield sync is skipped rather than failing the whole
  // operation: the discount reconciliation above has already succeeded
  // and is the real pricing engine, so a decorative storefront-widget
  // metafield for one bad id shouldn't roll it back.
  for (const productId of group.productIds) {
    if (group.status === 'live') {
      const info = await getProductInfo(productId)
      if (!info) {
        console.error(`[reconcileAndSync] skipping product tier sync: ${productId} not found`)
        continue
      }
      await syncProductTiers(productId, {
        groupId: group.id,
        basePrice: info.basePrice.toFixed(2),
        tiers: group.tiers.map((t) => ({
          minQty: t.minQty,
          unitPrice: resultingPrice(info.basePrice, t.percentOff).toFixed(2),
        })),
      })
    } else {
      await syncProductTiers(productId, null)
    }
  }
}

/**
 * Updates a group's assigned products. If the group is currently live,
 * this re-runs reconciliation immediately — adding a product creates its
 * discount right away, removing one deletes it — reverting the product
 * list on failure so the saved config never diverges from real Shopify
 * state. If the group is draft, this only touches config; reconciliation
 * happens later when the group goes live.
 */
export async function assignProducts(groupId: string, formData: FormData): Promise<void> {
  const productIdsRaw = String(formData.get('productIds') ?? '')
  const productIds = productIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const previousProductIds = group.productIds
  group.productIds = productIds

  if (group.status === 'live') {
    try {
      await reconcileAndSync(config, group)
    } catch (err) {
      group.productIds = previousProductIds
      throw err
    }
  } else {
    await saveConfig(config)
  }

  await redirectWithToken(`/groups/${groupId}`)
}

/**
 * Flips a group's status and reconciles Shopify's automatic discounts to
 * match. Refuses (throws, leaving the group's prior status in place) if
 * going live would exceed the 25-discount budget or collide with another
 * live group — see reconcile()'s ok:false path.
 */
export async function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const previousStatus = group.status
  group.status = status

  try {
    await reconcileAndSync(config, group)
  } catch (err) {
    group.status = previousStatus
    throw err
  }

  await redirectWithToken(`/groups/${groupId}`)
}
```

- [ ] **Step 2: Write the group editor page**

```tsx
// src/app/groups/[groupId]/page.tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/metafields'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfo } from '@/lib/products'
import { assignProducts, setGroupStatus } from '@/actions/groupActions'

const MAX_ACTIVE_DISCOUNTS = 25

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  await headers() // establishes request context for auth token, not used directly on this read-only page yet
  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)

  if (!group) notFound()

  const slotsUsed = config.groups
    .filter((g) => g.status === 'live')
    .reduce((sum, g) => sum + g.tiers.length * g.productIds.length, 0)

  const thisGroupSlots = group.tiers.length * group.productIds.length

  const assignProductsWithId = assignProducts.bind(null, groupId)
  const goLive = setGroupStatus.bind(null, groupId, 'live')
  const goDraft = setGroupStatus.bind(null, groupId, 'draft')

  // Real per-product pricing preview: fetch each assigned product's actual
  // Shopify price (Task 9) so the table below shows the exact resulting
  // price the discount will produce — never an example or placeholder. A
  // stale product id (deleted product, typo) resolves to null and is
  // shown as a visible warning row instead of crashing the page.
  const productPreviews = await Promise.all(
    group.productIds.map(async (productId) => ({
      productId,
      info: await getProductInfo(productId),
    })),
  )

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {group.status} · {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} store-wide discount slots used
        ({thisGroupSlots} from this group)
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Min qty</th>
              <th className="py-1">% off</th>
            </tr>
          </thead>
          <tbody>
            {group.tiers.map((tier) => (
              <tr key={tier.minQty} className="border-b">
                <td className="py-1">{tier.minQty}+</td>
                <td className="py-1">{tier.percentOff}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Resulting prices by product</h2>
        {productPreviews.length === 0 ? (
          <p className="text-sm text-gray-500">No products assigned yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Product</th>
                <th className="py-1">Base price</th>
                {group.tiers.map((tier) => (
                  <th key={tier.minQty} className="py-1">{tier.minQty}+</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productPreviews.map(({ productId, info }) => (
                <tr key={productId} className="border-b">
                  {info ? (
                    <>
                      <td className="py-1">{info.title}</td>
                      <td className="py-1">£{info.basePrice.toFixed(2)}</td>
                      {group.tiers.map((tier) => (
                        <td key={tier.minQty} className="py-1">
                          £{resultingPrice(info.basePrice, tier.percentOff).toFixed(2)}
                        </td>
                      ))}
                    </>
                  ) : (
                    <td colSpan={2 + group.tiers.length} className="py-1 text-red-600">
                      {productId} — product not found, will be skipped
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Assigned products</h2>
        <form action={assignProductsWithId} className="space-y-2">
          <textarea
            name="productIds"
            defaultValue={group.productIds.join(', ')}
            placeholder="gid://shopify/Product/123, gid://shopify/Product/456"
            className="w-full border rounded px-3 py-2 text-sm"
            rows={3}
          />
          <button type="submit" className="bg-gray-200 px-4 py-2 rounded text-sm">
            Save product list
          </button>
        </form>
      </section>

      <section>
        {group.status === 'draft' ? (
          <form action={goLive}>
            <button type="submit" className="bg-black text-white px-4 py-2 rounded">
              Go live
            </button>
          </form>
        ) : (
          <form action={goDraft}>
            <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded">
              Take offline
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 4: Run the full test suite one more time to confirm nothing regressed**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Bump APP_VERSION and commit**

This is the last task of Phase 1, shipping the feature that makes the app actually work end-to-end (go-live reconciliation) — bump the **minor** number: read the current `"version"` in `package.json`, increment its second segment by 1, and reset the third segment to `0`.

```bash
git add src/actions/groupActions.ts src/app/groups/[groupId]/page.tsx package.json
git commit -m "Add group editor: product assignment, slot meter, go-live reconciliation, real per-product prices"
```

---

## Self-Review

**1. Spec coverage.** Checked every numbered section of the design spec against the tasks above:

- §2.1 (Partners dev app, not Develop-apps) → Task 2 implements Partners OAuth exactly.
- §2.2 (native discounts, no Functions) → Task 8's `createDiscount` uses `discountAutomaticBasicCreate`; no Function code anywhere.
- §2.3 (per-product threshold semantics) → Task 7's `desiredDiscountsForGroup` creates one discount per product per tier, never a multi-product discount.
- §2.4 (loose units only, no bundles) → nothing in Tasks 1–12 creates a variant or bundle; out of scope per spec §10, correctly absent.
- §2.5 (Google Shopping via Shopify's native channel) → correctly requires zero code in this plan. Nothing here builds a feed, a multipack row, or a `?qty=` link, matching the spec's description that the native Google & YouTube channel handles this entirely outside the app.
- §2.6 (metafields, no database) → Task 5 (`metafields.ts`) and Task 2's callback (logs token instead of writing to a DB).
- §3 (architecture diagram) → Tasks 4/5 (metafield layer), 6/7/8 (engine), 9 (product prices), 10–12 (admin UI) collectively implement the diagram, which is now feed-free per §2.5. The theme extension is correctly Phase 2, out of this plan's scope.
- §4 (data model: `shop.sparkly_tiers.config`, `product.sparkly_tiers.tiers`, percent-off units) → Task 5 implements both metafields with the exact namespace/key; Task 6 implements the percent/fraction distinction with a dedicated test; Task 9 and Task 12 supply the real per-product `basePrice`/`unitPrice` the data model specifies, computed from each product's actual Shopify price rather than a placeholder.
- §5.1 (reconciler: idempotent, self-healing, budget-safe) → Task 7's test suite covers idempotency (test: "produces zero actions when actual state already matches"), self-healing (implicit: `listActualDiscounts` reads real Shopify state every time, so hand-edits are detected as diffs), and all-or-nothing budget refusal (2 dedicated tests).
- §5.1 discount shape (`combinesWith: productDiscounts: false`) → hard-coded in Task 8's `createDiscount`.
- §5.2 (admin UI: groups list, group editor, slot meter, settings) → Tasks 10, 11, 12 cover groups list, create, edit/assign/go-live, and the slot meter. **Gap found: the spec's "Settings — copy templates and CSS" (§5.2, §3 `shop.sparkly_tiers.settings`) has no task.** This is intentionally deferred: settings only matter to the Phase 2 storefront widget's rendering, and building a settings UI with no consumer yet would be speculative. Noting this explicitly rather than silently dropping it — Phase 2's plan must add the settings metafield and its editor page before the widget can read it.
- §5.3 (theme app extension / widget) → out of scope, Phase 2, correctly absent.
- §5.4 (Google Shopping, no app component) → correctly absent from this plan.
- §6 (auth) → Tasks 2–3 implement this exactly, copied from the proven `sparkly-tails-pickup-app` implementation.
- §7 (phasing) → this plan covers Phase 1 only, per the spec's "Planning scope" note. Google Shopping (§2.5) needs no phase of its own.
- §8 (testing: pure units carry correctness) → `tier-math` and `reconciler` are 100% pure and fully unit-tested (Tasks 6, 7).
- §9 (risks) → the feed price-mismatch risk no longer applies (no custom feed exists to mismatch, §2.5); 25-slot cap is Task 7/12's slot meter and all-or-nothing refusal; rounding is Task 6's `resultingPrice`, now shown against each product's real price in Task 12's per-product table rather than an example; token-in-env trade-off is Task 2 Step 7's explicit design.
- §10 (out of scope) → confirmed nothing in this plan builds bundles, buyable packs, Functions, multi-shop storage, mix-and-match groups, or a custom Google feed.

**2. Placeholder scan.** An earlier revision of this plan left one placeholder — `unitPrice: '0.00'` in Task 12's (then Task 11's) `syncProductTiers` call — flagged inline rather than hidden, with a note explaining why. This revision resolves it: Task 9 adds real product price lookup (`getProductInfo`), and Task 12 now computes `basePrice`/`unitPrice` from each product's actual Shopify price via `resultingPrice`, shown live in the group editor's per-product table. No placeholders remain in this plan. No other TBD/TODO/"add proper handling" patterns found.

**3. Type consistency.** Traced every shared type/function across task boundaries:
- `Config`, `TierGroup`, `Tier` — defined once in Task 5, imported (never redeclared) by Tasks 7, 11, 12.
- `ActualDiscount`, `Action`, `ReconcileResult` — defined once in Task 7, imported by Task 8 and Task 12.
- `percentOffFromTargetPrice`, `resultingPrice`, `percentageToShopifyFraction` — defined once in Task 6; `resultingPrice` used in Task 12's page and `setGroupStatus`, `percentageToShopifyFraction` used in Task 8's `createDiscount`/`listActualDiscounts`. Names match exactly at every call site.
- `ProductInfo` / `getProductInfo(productId)` — defined once in Task 9, imported by Task 12's `setGroupStatus` and its group editor page with no signature drift.
- `shopifyQuery<T>` — defined once in Task 4, imported by Tasks 5, 8, and 9 with no signature drift.
- `redirectWithToken`, `appendToken`, `setAuthToken`/`getAuthToken` — defined once in Task 3, imported by Task 11/12's Server Actions and Task 10's page.
- `syncProductTiers(productId, productTiers)` — defined in Task 5 with a nullable second parameter and a `DenormalisedProductTier` shape that now includes `basePrice`; called in Task 12 with either a real computed object (from Task 9's price + Task 6's math) or `null`, matching the signature exactly.

No drift found between definition and call sites.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-17-shopify-tiered-pricing-phase-0-1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
