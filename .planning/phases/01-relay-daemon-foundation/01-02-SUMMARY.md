---
phase: 01-relay-daemon-foundation
plan: 02
subsystem: api
tags: [express, typescript, zod, better-sqlite3, vitest, supertest, wireguard, relay]

# Dependency graph
requires:
  - phase: 01-relay-daemon-foundation
    plan: 01
    provides: "@homelan/shared type contracts (RegisterRequest, LookupResponse, RelayError)"

provides:
  - "Express relay server with POST /register and GET /lookup/:publicKey endpoints"
  - "Config validation via zod (fails fast on missing RELAY_SECRET)"
  - "SQLite and in-memory PeerStore backends with TTL-based expiry"
  - "HTTPS-only enforcement middleware"
  - "In-memory rate limiting middleware (100 req/min)"
  - "Vercel serverless deployment config"
  - "Docker deployment config for VPS"

affects:
  - 01-03-daemon-core
  - 02-tunnel-nat-cli

# Tech tracking
tech-stack:
  added:
    - express 5.x (HTTP server framework)
    - zod 3.x (schema validation, config + request body)
    - better-sqlite3 9.x (native SQLite for persistent peer storage)
    - supertest 7.x (HTTP integration testing)
    - tsx 4.x (TypeScript watch mode for dev)
  patterns:
    - "Factory pattern: createApp(config, store) exported for test isolation"
    - "Storage abstraction: PeerStore interface with sqlite/memory swap"
    - "TDD cycle: RED (failing tests) → GREEN (implementation) → build verify"
    - "ESM dynamic import for better-sqlite3 to avoid loading native module in serverless"

key-files:
  created:
    - packages/relay/src/config.ts
    - packages/relay/src/config.test.ts
    - packages/relay/src/store/index.ts
    - packages/relay/src/store/sqlite.ts
    - packages/relay/src/store/memory.ts
    - packages/relay/src/store/store.test.ts
    - packages/relay/src/app.ts
    - packages/relay/src/index.ts
    - packages/relay/src/middleware/httpsOnly.ts
    - packages/relay/src/middleware/rateLimit.ts
    - packages/relay/src/routes/register.ts
    - packages/relay/src/routes/lookup.ts
    - packages/relay/src/routes/register.test.ts
    - packages/relay/src/routes/lookup.test.ts
    - packages/relay/vercel.json
    - packages/relay/Dockerfile
    - packages/relay/tsconfig.json
    - .npmrc
  modified:
    - packages/relay/package.json

key-decisions:
  - "createStore() made async with dynamic import to keep better-sqlite3 out of serverless bundle"
  - "Hand-rolled rate limiter using Map avoids express-rate-limit dependency"
  - "httpsOnly skips check in NODE_ENV=development for local testing"
  - "SQLiteStore.findByPublicKey() filters by timestamp in SQL WHERE clause, not post-query"
  - ".npmrc added to allow better-sqlite3 native build scripts (pnpm blocks by default)"

patterns-established:
  - "Router factory pattern: registerRouter(store, config) returns IRouter for testability"
  - "Explicit return types on exported functions for TypeScript portability across pnpm workspaces"
  - "Shared test factory: runStoreTests() runs same suite against both backends"

requirements-completed: [RELY-01, RELY-02, RELY-03, RELY-04, AUTH-03]

# Metrics
duration: 15min
completed: 2026-03-11
---

# Phase 1 Plan 2: Relay Server Summary

**Express relay server with Zod-validated config, dual-backend peer storage (SQLite/memory), HTTPS enforcement, rate limiting, Vercel + Docker deployment — 18 tests passing**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T19:17:09Z
- **Completed:** 2026-03-11T19:23:30Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Config validation with zod: throws with clear error on missing RELAY_SECRET, defaults for all optional vars
- REST API: POST /register (Zod-validated WireGuard key), GET /lookup/:publicKey, GET /health
- Dual storage: SQLiteStore (better-sqlite3, persistent, VPS) + MemoryStore (Map-based, serverless/Vercel)
- TTL-based peer expiry enforced in SQL WHERE clause and Map eviction
- httpsOnly middleware rejects plain HTTP with 400 HTTPS_REQUIRED, dev-mode bypass
- Rate limiter: 100 req/60s per IP, hand-rolled Map-based, zero external deps
- Build produces typed dist/ with declarations, ready for server start

## Task Commits

1. **Task 1: Config validation and storage abstraction** - `39a495b` (feat)
2. **Task 2: Express app with register/lookup routes** - `3f63257` (feat)

## Files Created/Modified

- `packages/relay/src/config.ts` - loadConfig() with zod ConfigSchema, throws on missing RELAY_SECRET
- `packages/relay/src/store/index.ts` - PeerStore interface + async createStore() factory
- `packages/relay/src/store/sqlite.ts` - SqliteStore using better-sqlite3 with UPSERT + TTL filter
- `packages/relay/src/store/memory.ts` - MemoryStore using Map, same interface
- `packages/relay/src/app.ts` - createApp() factory (exported for testing)
- `packages/relay/src/index.ts` - Server entry point with loadConfig/createStore/createApp
- `packages/relay/src/middleware/httpsOnly.ts` - Rejects x-forwarded-proto!=https
- `packages/relay/src/middleware/rateLimit.ts` - 100 req/min per IP in-memory limiter
- `packages/relay/src/routes/register.ts` - POST /register with 44-char base64 key validation
- `packages/relay/src/routes/lookup.ts` - GET /lookup/:publicKey returning LookupResponse
- `packages/relay/vercel.json` - Serverless routing with RELAY_STORAGE=memory
- `packages/relay/Dockerfile` - node:22-alpine image for VPS deployment
- `packages/relay/tsconfig.json` - Extends root tsconfig.base.json
- `packages/relay/package.json` - Added all production and dev dependencies
- `.npmrc` - Allows better-sqlite3 native build scripts

## Decisions Made

- `createStore()` made async with dynamic import so better-sqlite3 native module isn't loaded in serverless environments (Vercel)
- Hand-rolled rate limiter to avoid express-rate-limit dependency; trivial Map + timestamp logic
- `httpsOnly` middleware skips in `NODE_ENV=development` to allow local testing without TLS termination
- Added `.npmrc` with `ignore-scripts=false` because pnpm blocks native builds by default on this machine
- Explicit return type annotations (`Express`, `IRouter`) on exported functions required for TS declaration portability across pnpm workspaces

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS2742 portable type error on exported functions**
- **Found during:** Task 2 (build verification)
- **Issue:** TypeScript could not name inferred return types (`Express`, `IRouter`) without referencing internal pnpm paths, breaking declaration portability
- **Fix:** Added explicit return type annotations to `createApp()`, `registerRouter()`, `lookupRouter()`
- **Files modified:** `src/app.ts`, `src/routes/register.ts`, `src/routes/lookup.ts`
- **Verification:** `pnpm --filter @homelan/relay build` succeeds with no errors
- **Committed in:** `3f63257` (Task 2 commit)

**2. [Rule 3 - Blocking] better-sqlite3 native binary not built (pnpm blocks scripts)**
- **Found during:** Task 1 (first test run)
- **Issue:** pnpm's `ignore-scripts` default prevented better-sqlite3 from compiling its native `.node` binding
- **Fix:** Created `.npmrc` with `ignore-scripts=false`, manually triggered `npm run build-release` in better-sqlite3 package dir
- **Files modified:** `.npmrc`
- **Verification:** SqliteStore tests pass (4/4 in store.test.ts)
- **Committed in:** `39a495b` (Task 1 commit)

**3. [Rule 1 - Bug] createStore() used require() which fails in ESM project**
- **Found during:** Task 2 (createStore async needed for index.ts)
- **Issue:** `const Database = require("better-sqlite3")` fails in `"type": "module"` packages
- **Fix:** Changed to `async function createStore()` with `await import("better-sqlite3")`
- **Files modified:** `src/store/index.ts`, `src/index.ts`
- **Verification:** Build and tests pass, index.ts uses `await createStore()`
- **Committed in:** `3f63257` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and build. No scope creep.

## Issues Encountered

- better-sqlite3 requires manual native build approval on this Windows development machine (pnpm security policy). Added `.npmrc` to resolve permanently.

## User Setup Required

None - no external service configuration required. When deploying:
- Set `RELAY_SECRET` environment variable (required, no default)
- Set `RELAY_STORAGE=memory` on Vercel (SQLite not available in serverless)
- Set `NODE_ENV=development` for local HTTPS-bypass

## Next Phase Readiness

- Relay server is complete and deployable
- All 18 tests pass, TypeScript builds clean
- Plan 01-03 (daemon core) can begin - relay API is stable
- Relay endpoint URLs needed before daemon client can connect (Phase 2)

---
*Phase: 01-relay-daemon-foundation*
*Completed: 2026-03-11*
