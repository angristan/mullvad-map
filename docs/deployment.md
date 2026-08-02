# Deployment

This repository's `main` branch is connected to Cloudflare Workers Builds. Successful pushes deploy to `mullvad.stanislas.cloud`. The `workers.dev` and preview URLs are disabled. A separate `Deploy main` hook is stored only in the Cloudflare dashboard for explicit webhook-triggered rebuilds.

## Prerequisites

- A Cloudflare account with Workers enabled
- Bun 1.3.9
- A GitHub repository for Workers Builds
- Wrangler authentication for manual operations: `bunx wrangler login`

## One-time resource setup

Create a KV namespace:

```bash
bunx wrangler kv namespace create RELAY_CACHE
```

Set its ID in `wrangler.jsonc`. KV namespace IDs are resource identifiers, not authentication secrets. Forks must create and use their own namespace.

The rate-limit `namespace_id` in `wrangler.jsonc` must also be unique within the deploying Cloudflare account. It is not a secret. Reusing it can make unrelated Workers share counters when they use the same keys.

Validate before the first deployment:

```bash
bun install --frozen-lockfile
bun run typegen
bun run check
```

## Manual deployment

```bash
bun run deploy
```

This builds the client and Worker, then deploys both through the project-pinned Wrangler version.

Smoke-test the configured custom domain:

```bash
curl -fsS https://mullvad.stanislas.cloud/api/health
curl -fsS https://mullvad.stanislas.cloud/api/relays > /dev/null
```

Check the globe, filters, relay drawer, and one explicitly authorized latency run in a browser.

## Automatic deployment with Workers Builds

Use Cloudflare's native GitHub integration. It receives repository push events and deploys `main` without storing Cloudflare credentials in GitHub Actions.

For an existing Worker:

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Select the Worker.
3. Open **Settings → Builds → Connect**.
4. Authorize the **Cloudflare Workers and Pages** GitHub App for the repository.
5. Configure the production trigger:

```text
Production branch: main
Root directory: /
Build command: bun install --frozen-lockfile && bun run check
Deploy command: bunx wrangler deploy
Build cache: enabled
BUN_VERSION: 1.3.9
SKIP_DEPENDENCY_INSTALL: true
```

Keep non-production branch deployments disabled unless preview code has separate mutable bindings. With the current single environment, a preview would use the production KV namespace.

A push to `main` should create a Cloudflare check run in GitHub, build the repository, and promote the resulting Worker version only after `bun run check` succeeds.

### Deploy hooks

Workers Builds can also create a secret deploy-hook URL under **Settings → Builds → Deploy Hooks**. A `POST` to that URL starts a build for its configured branch. The URL is an authentication credential: keep it out of source control, logs, and public CI output, and rotate it if exposed.

A deploy hook is not required for normal GitHub push deployments because the Git integration already receives repository events.

## Rollback

List deployments and roll back with the project-pinned Wrangler version:

```bash
bunx wrangler deployments list
bunx wrangler rollback
```

Worker versions include code, static assets, bindings, and compatibility configuration. They do not snapshot KV data. A code rollback is not a KV rollback.
