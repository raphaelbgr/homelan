# Stack Research: Personal VPN/Tunnel Tool

**Domain:** Cross-platform VPN/tunnel software with WireGuard, desktop GUI, relay server, and CLI
**Researched:** 2025-03-11
**Confidence:** HIGH (verified with official docs and ecosystem sources)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 22.x LTS (Active) or 24.x LTS (Krypton, starting 2025-05-06) | Runtime for relay server, CLI, and backend services | LTS releases provide 30 months of critical bug fixes. Node 22 is stable production choice; Node 24 will be default by mid-2025. Even-numbered versions = LTS. Handles async I/O well for relay server packet forwarding. |
| **TypeScript** | 5.x (strict mode) | Type-safe development across CLI, relay, and backend | Strict mode catches categories of bugs at compile time. Standard for Node.js CLI tooling. Provides excellent IDE support. Mandatory for maintainability in security-critical code. |
| **Tauri** | 2.10.x | Cross-platform desktop GUI (Windows, macOS) | Tauri 2.0 (stable Oct 2024) uses native OS WebView + Rust core: ~10MB installer vs Electron's 100MB+. 30–50MB idle RAM vs Electron's 150–300MB. Built-in permission system with capability-based access control. Modern plugin architecture. Can extend to mobile later (iOS/Android) from same codebase. |
| **React** | 19.x | Frontend framework for desktop GUI | Stable, mature ecosystem. Works seamlessly with Tauri. Server-side rendering not needed (desktop app). Component reusability across features. |
| **WireGuard** | Latest stable (kernel module + wireguard-go) | VPN tunnel protocol | Official, audited, modern cryptography. Kernel-level performance. Cross-platform (Linux kernel, Windows/macOS via userspace). Simpler than OpenVPN (fewer attack surface). Used by Tailscale and commercial VPN vendors. No user account complexity needed (key-based auth). |
| **Express.js** | 5.x (or 4.x if stability critical) | HTTP server for relay service | Lightweight, well-documented. Sufficient for relay's simple handshake/discovery role. Native TypeScript support via tsx. Trivial deployment to Vercel, AWS, any VPS. |

### Desktop GUI Stack (Tauri + React)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **React** | 19.x | UI component framework | Always — primary rendering engine for Tauri frontend. |
| **TypeScript** | 5.x | Type-safe React components | Always — prevents prop/state bugs. |
| **Tailwind CSS** | 3.x+ | Utility-first CSS | Desktop UI styling with minimal CSS. Rapid iteration. |
| **shadcn/ui** | Latest | React component library | Pre-built, accessible components (buttons, toggles, dialogs, status displays). Reduces custom CSS. Optional but recommended for consistent design. |
| **TanStack Query (React Query)** | 5.x | Data fetching and caching | Optional but recommended if relay/server queries are frequent. Handles loading/error states cleanly. |
| **Tauri IPC (invoke)** | Built-in v2 | Frontend ↔ Backend communication | Required. Tauri's native command invocation for CLI calls, tunnel status, connection control. Supports raw payloads for large data transfers. |

### CLI Stack (Node.js + TypeScript)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Commander.js** | 12.x | CLI argument parsing and command structure | Ideal for personal tools with 5–10 commands (connect, disconnect, status, switch-mode). Smaller footprint than oclif. POSIX-compliant arg handling. |
| **chalk** | 5.x | Terminal string styling | Color-coded output (green=connected, red=error, yellow=warning). Better UX for status display. |
| **ora** | 8.x | Terminal loading spinners | Visual feedback during connection/disconnection. |
| **minimist** or **yargs** | Latest | Advanced argument parsing (if needed) | Use Commander for simplicity first; upgrade to yargs if deeply nested commands required. |

### Relay Server Stack (Node.js + TypeScript + Express)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Express** | 5.x or 4.18.x | HTTP/HTTPS server for relay | Always — handles incoming handshake requests from clients. Stateless, easy to scale horizontally. |
| **TypeScript** | 5.x | Type-safe server code | Always — runtime errors are expensive for a relay. |
| **ws (WebSocket)** | 8.x | WebSocket support for DERP-style relaying | Optional: if implementing Tailscale-style DERP (binary-safe packet forwarding). Otherwise HTTP/REST suffices for discovery. |
| **dotenv** | 16.x | Environment variable management | Config for relay (TLS cert paths, port, upstream servers). |
| **helmet** | 7.x | HTTP security headers | Standard middleware for HTTPS endpoints (CSP, HSTS, etc.). |

### WireGuard Key Management Stack

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **wireguard-tools** | Latest (0.x) | Key generation and config file handling | Primary choice. JavaScript-native, supports `generateKeys()`, peer management, config serialization. No external binaries needed. |
| **wireguard-wrapper** | 1.x | Wrapper around `wg` and `wg-quick` CLI | Fallback if wireguard-tools proves insufficient. Calls OS-level commands. Works if WireGuard CLI is installed on system. Higher latency but battle-tested. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **tsx** | TypeScript execution without compilation | Fast, native ESM support. Better than ts-node for development. Used in scripts and CLI. |
| **Vitest** | Unit testing framework | Native ESM, fast, excellent TypeScript support. Preferred over Jest for modern projects. Use Jest only if locked to CommonJS. |
| **ESLint** (flat config) | Code linting | Modern flat config (ESLint 9+). Enforces coding standards. |
| **Prettier** | Code formatting | Opinionated formatter. Pair with ESLint. |
| **nodemon** | Development server auto-reload | Restarts relay server on file changes during dev. Not needed in production. |
| **Cargo + Rust** | Tauri backend compilation | Required only for Tauri desktop builds. Single Rust file can contain IPC command handlers. |

## Installation

```bash
# Core runtime
npm install node@22

# Desktop app setup
npm create tauri-app@latest -- --package-manager npm --typescript yes --ui react

# Add desktop UI libraries
npm install react@19 typescript@5 tailwindcss@3 shadcn-ui

# CLI setup (in separate workspace/package)
npm init -y
npm install commander chalk ora typescript@5 tsx

# Relay server setup
npm init -y
npm install express helmet dotenv typescript@5
npm install -D @types/node @types/express tsx nodemon eslint prettier

# WireGuard key management
npm install wireguard-tools
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Tauri 2.x** | **Electron** | If you need: legacy browser support, extensive npm ecosystem, or first-class Node.js access in main process. Trade-off: 10x larger bundle, 5x higher RAM. For this use case (lightweight personal tool), Tauri is 90% better choice. |
| **Tauri 2.x** | **Flutter Rust Bridge** | If UI must be native (not web-based). Adds Dart complexity. Skip unless you have native UI requirements. |
| **React** | **Vue.js** or **Svelte** | React has larger ecosystem for Tauri. Vue/Svelte are lighter but smaller plugin support. React is safe default. |
| **Express.js** | **Fastify** or **Hono** | Fastify = faster, more type-safe. Hono = ultralight. For relay (low-traffic), Express simplicity wins. Use Fastify if relay becomes bottleneck (unlikely v1). |
| **Commander.js** | **oclif** | oclif for large CLI suites (20+ commands). Commander for simple tools (5–10 commands). This project: Commander. |
| **wireguard-tools** | **node-wireguard** or custom crypto | node-wireguard abandoned. wireguard-tools is the standard. Custom crypto = security risk (don't). |
| **Node.js 22 LTS** | **Node.js 24 LTS (Krypton)** | Node 24 available mid-2025. Both safe. Start with 22, plan upgrade to 24 by EOY 2025. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Electron** | Bundle size (100–150MB), memory footprint (150–300MB idle), slow startup (1–2s), poor mobile future. Overkill for personal tool. | **Tauri 2.x** — 10MB, 50MB RAM, 0.4s startup, mobile-ready. |
| **OpenVPN** | Complex configuration, larger codebase, slower than WireGuard, steeper learning curve. | **WireGuard** — modern, audited, kernel-level perf, simple config. |
| **Home-rolled encryption** | Cryptographic bugs are costly and unfixable post-release. WireGuard's Noise protocol is audited. | **WireGuard keys** — proven protocol, peer review. |
| **REST-only relay** | If hole-punching fails, REST can't forward packets. | **Consider DERP (WebSocket-based relay)** for Tailscale-compatible fallback, or accept P2P-only for v1. |
| **CommonJS** (`require`)  | Node.js ecosystem moving to ESM. TypeScript + ESM = cleaner. | **ESM + TypeScript** — use `"type": "module"` in package.json, tsx runner. |
| **Any implicit** | Defeats TypeScript's purpose. Will cause silent bugs in security code. | **Enable `strict: true` and `noImplicitAny` from day one.** |
| **Old Node.js versions** (18.x or older) | Security patches expire. LTS clock keeps ticking. | **Node.js 22.x LTS (now)** or **24.x LTS (after May 2025)**. |
| **Passport.js or session-based auth** | Project uses WireGuard keys (no user accounts needed). Session auth = scope creep. | **WireGuard key-based peer verification only** for v1. |

## Stack Patterns by Variant

### Full Standalone Version (Recommended for v1)

Use this for all-in-one build:

- **Desktop GUI:** Tauri + React + TypeScript + Tailwind
- **CLI:** Node.js + Commander + TypeScript + chalk
- **Relay:** Node.js + Express + TypeScript (simple HTTP discovery)
- **Key Management:** wireguard-tools
- **WireGuard:** OS-level `wg` + `wg-quick` CLI

Rationale: Single tech stack across all components. Relay is stateless and trivial to deploy. Desktop and CLI can share key generation logic.

### Web-Based Management Dashboard (v2+)

If later adding a web UI for relay management:

- Frontend: React (same code as desktop app, or separate Next.js app)
- Backend: Express.js + GraphQL (e.g., Apollo Server) instead of REST
- Database: SQLite (simple) or PostgreSQL (scalable relay usage tracking)

Rationale: Keep core VPN separate; dashboard is optional.

### Mobile Clients (v2+, Tauri Advantage)

Tauri 2.0+ supports iOS/Android from same codebase:

- Reuse frontend React code (with platform-specific adjustments)
- Rust backend compiles to iOS/Android native libraries
- Eliminate Electron → mobile rewrite burden

Rationale: Tauri planned for Raphael's Fire TV client in future; React code ports to mobile with minimal changes.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Node.js 22.x LTS | TypeScript 5.x, Express 5.x, all npm packages used | Stable production. No breaking changes expected until Node 26 (2026). |
| Node.js 24.x LTS (Krypton, May 2025) | TypeScript 5.x, Express 5.x, all npm packages | Future-proof. Plan migration by Q4 2025. |
| Tauri 2.10.x | React 19.x, TypeScript 5.x, Rust 1.70+, macOS 10.13+, Windows 7+ | Stable. v2.10 patch releases backport security fixes. Don't expect v3 before 2026. |
| React 19.x | TypeScript 5.x, Tauri 2.10.x, Tailwind 3.x | Latest React is stable for Tauri. No major breaking changes expected in 2025. |
| TypeScript 5.x | Node.js 18+, React 19, Express 5.x | Strict mode mandatory for this project. Don't downgrade. |
| Express 5.x | Node.js 18+, TypeScript 5.x, helmet 7.x | Express 5 = modern async/await, ESM-ready. Express 4.18.x also works if stability preferred (currently most used). Upgrade to 5.x when released fully (RC now). |
| wireguard-tools | Node.js 18+, TypeScript 5.x | Pure JS, no native bindings. Zero OS-level deps. |
| Commander.js 12.x | Node.js 18+, TypeScript 5.x | Latest. Stable API. Back-compatible with Commander 11.x. |

**Breaking Change Watch (2025):**
- Express 5.0 final release expected mid-2025. Currently RC. No major breaking changes from 4.18.x.
- Tauri 2.x stable; no breaking changes planned for v2.x patch releases.
- TypeScript 5.x is LTS-like. Major updates come ~12 months apart (5.6, 5.7, etc.). Current: 5.x is safe default.

## Critical Dependency Decisions

### Why NOT GitHub Actions for relay deployment?

Relay must run continuously (24/7). GitHub Actions = CI/CD (periodic runs). Deploy to:
- **Vercel** (free tier, Node.js, auto-scaling, TLS included) — **recommended for v1**
- **AWS Lambda + ALB** (serverless, cold start risk, unnecessary complexity)
- **Heroku** (simple, but paid-only now)
- **Self-hosted** on Raphael's Linux VM or cloud VPS (full control, must manage TLS/DNS)

Recommendation: Start with **Vercel for relay** (zero ops) + **self-hosted WireGuard server** (on existing Linux VM).

### Why NOT use Rust for CLI?

- Node.js CLI ships as executable (via `pkg` or `caxa`) just like compiled Rust.
- TypeScript reduces friction: same language as backend, easier for team.
- CLI is not hot-path; performance difference negligible.
- Avoid forcing Raphael to context-switch between JavaScript (Tauri) and Rust.

**Exception:** If CLI performance becomes critical (processing 10K+ peers per command), consider Rust port. Unlikely for personal v1.

### Why NOT use a single Rust binary for everything?

- Rust = longer development time, steeper learning curve, slower iteration.
- Tauri + React for GUI is established pattern; Rust for backend alone adds complexity.
- Desktop GUI in Rust (not Tauri) would require rebuilding rendering stack.
- v1 goal: ship MVP fast. Rust optimization = v2 if needed.

## Deployment Targets

### Desktop App
- **Windows:** Tauri builds `.exe` installer. No signing required for personal use (can add code-signing later).
- **macOS:** Tauri builds `.dmg` + `.app` bundle. Requires Apple Developer ID for notarization (optional, but recommended to avoid "unidentified developer" warnings).

### Relay Server
- **Vercel:** Free tier Node.js, auto-deploys from GitHub, TLS managed, scales to millions of requests. No credit card needed for hobby tier.
- **AWS Lambda:** Stateless, cold start latency (≤500ms acceptable for relay). APIGateway + Lambda + CloudWatch.
- **Linux VM (self-hosted):** Systemd service, Nginx reverse proxy, Let's Encrypt TLS, cron for cert renewal.

### CLI
- **Distribution:** Ship as npm package (`npm install -g @raphael/personal-tunnel-cli`), or standalone executable (`pkg` tool to bundle Node.js + code).
- **Scope:** `@raphael` namespace on npm suggests personal/private package. Use GitHub Packages or npmjs.com.

## Testing Strategy

| Component | Tool | Why |
|-----------|------|-----|
| Desktop GUI | **Vitest** + **Testing Library** | React component unit tests. Vitest for fast ESM support. |
| CLI | **Vitest** | Command parsing, output formatting tests. |
| Relay Server | **Vitest** + **Supertest** | HTTP endpoint tests, mock WireGuard responses. |
| End-to-End | **Playwright** (desktop) or **Cypress** | Full desktop app flow: connect, switch mode, disconnect. Lower priority for v1. |
| WireGuard Integration | **Manual + systemd tests** | WireGuard setup is OS-level. No unit tests; validate via integration tests on each platform (Windows, macOS, Linux VM). |

## Sources

- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) — Architecture, performance, plugin system
- [Electron vs. Tauri Comparison 2025](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/) — Bundle size, memory, security trade-offs
- [Node.js LTS Status and Version Strategy](https://nodejs.org/en/about/previous-releases) — LTS timeline, version selection
- [TypeScript 5.x Best Practices](https://medium.com/@nikhithsomasani/best-practices-for-using-typescript-in-2025-a-guide-for-experienced-developers-4fca1cfdf052) — Strict mode configuration
- [Express.js + TypeScript 2025 Setup](https://medium.com/@gabrieldrouin/node-js-2025-guide-how-to-setup-express-js-with-typescript-eslint-and-prettier-b342cd21c30d) — Modern tooling, ESM adoption
- [wireguard-tools npm package](https://www.npmjs.com/package/wireguard-tools) — Key generation and config handling
- [Commander.js Documentation](https://github.com/tj/commander.js) — CLI framework for Node.js
- [React + Tauri Integration](https://v2.tauri.app/start/create-project/) — Official Tauri React template
- [WireGuard Protocol and Key Distribution](https://www.wireguard.com/protocol/) — Cryptography, peer discovery model
- [Tailscale DERP Implementation](https://tailscale.com/kb/1232/derp-servers) — Relay server reference architecture

---

**Stack Confidence Breakdown:**

| Component | Confidence | Reason |
|-----------|------------|--------|
| **Tauri 2.x for Desktop** | HIGH | Stable release, proven in production apps (DefGuard, TunnlTo). Official docs comprehensive. |
| **React + TypeScript** | HIGH | Industry standard. Tauri templates verified. Large ecosystem. |
| **Node.js 22 LTS** | HIGH | Official LTS status. 30-month support window. All tooling compatible. |
| **Express + TypeScript for Relay** | MEDIUM-HIGH | Established pattern. Relay is simple (HTTP discovery only). If DERP-level complexity needed, upgrade to Fastify. |
| **wireguard-tools** | MEDIUM | Actively maintained. Good GitHub activity. Used by smaller projects. No production CVEs found (as of Feb 2025). Consider fallback to wireguard-wrapper if issues arise. |
| **Commander.js for CLI** | HIGH | Stable, widely used, POSIX-compliant. Unlikely to break. |
| **Tailwind + shadcn/ui** | HIGH | Industry standard for rapid UI dev. Large community support. |

---

*Stack research for: Personal VPN/Tunnel Tool (WireGuard + Desktop GUI + Relay + CLI)*
*Researched: 2025-03-11*
