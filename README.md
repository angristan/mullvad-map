# Mullvad Relay Atlas

A fast, unofficial map of Mullvad VPN infrastructure. Explore relay status, location, ownership, provider, type, speed, DAITA support, addresses, and boot method.

## Stack

- React 19 and Mantine 9
- MapLibre GL JS with OpenFreeMap
- TanStack Query for browser server state
- Cloudflare Worker and Static Assets through the Cloudflare Vite plugin
- Effect 4 for upstream decoding, typed failures, and cache orchestration
- Workers KV for the relay snapshot cache
- Workers Rate Limiting for API protection

```text
Browser
  ├─ static files ───────────────> Cloudflare Asset Worker
  └─ GET /api/relays
       └─ native rate limiter
            └─ Effect relay service
                 ├─ fresh KV value ─────────────> response
                 ├─ stale KV value ─────────────> response + waitUntil(refresh)
                 └─ cache miss ─> Mullvad APIs ─> KV ─> response
```

Static files bypass Worker code. Only `/api/*` invokes the Worker.

## Run locally

```bash
bun install
bun run typegen
bun run dev
```

Open the local URL printed by Vite. It binds IPv4 explicitly and automatically selects the next available port.

The Cloudflare Vite plugin runs the API in `workerd`. Local KV data is persisted by Wrangler. The native rate-limit binding is configured, but local behavior is not a substitute for a production rate-limit smoke test.

## Validate

```bash
bun run check
```

This command checks generated binding types, runs domain and Workerd integration tests, builds the client and Worker, and performs a Wrangler dry run.

## Cloudflare setup

`wrangler.jsonc` contains a placeholder KV namespace ID. Before the first deployment:

```bash
bunx wrangler kv namespace create RELAY_CACHE
```

Replace `00000000000000000000000000000000` in `wrangler.jsonc` with the returned namespace ID. Creating the namespace and deploying are remote writes.

Then deploy:

```bash
bun run deploy
```

The Worker is configured for `workers.dev` and preview URLs. Logs sample all invocations and traces sample 10%; review these rates against real traffic and cost before production.

## Cache and failure behavior

- KV snapshots are fresh for 15 minutes.
- Stale snapshots remain available for up to seven days.
- Stale requests return immediately while `ctx.waitUntil()` refreshes the cache.
- A cold cache waits for Mullvad's APIs.
- Invalid upstream and KV payloads are decoded with Effect Schema.
- Client requests are limited to 120 per minute per IP and Cloudflare location.
- API responses support ETags and short browser caching.

KV is eventually consistent. Multiple Cloudflare locations can refresh an expired snapshot at approximately the same time. The isolate-local in-flight promise only deduplicates refreshes within one warm isolate.

## Estimated latency

Latency testing is manual and experimental. The Worker orders active WireGuard locations by distance from the visitor's Cloudflare edge location. The browser tests every matching active WireGuard location using one relay per location.

Each test makes three TLS connection attempts to the relay's literal IPv4 address on port 443. Mullvad serves an obfuscation protocol rather than HTTPS on that port, so rejection is expected. The UI estimates network RTT as one quarter of the median rejection duration, based on local calibration against ICMP ping. No HTTP request reaches the relay.

Globe node size reflects the square-root-scaled sum of active relays' listed port capacity, bounded to preserve readability. This is nominal capacity, not live utilization or guaranteed throughput. When testing starts, globe nodes turn gray and update as each result arrives. Completed nodes use a logarithmic green-to-pink gradient normalized between the run's 10th and 90th latency percentiles, and the location list progressively sorts by estimated RTT. The estimate is useful for ranking but is not ICMP ping. Browser networking changes or Mullvad port behavior can invalidate the calibration. It has been smoke-tested in Chromium; Firefox and Safari still need validation. If Cloudflare edge coordinates are unavailable, the Worker returns a geographically distributed candidate order.

## Mullvad data

The Worker joins two official Mullvad endpoints:

| Endpoint | Used for |
| --- | --- |
| [`/app/v1/relays`](https://api.mullvad.net/app/v1/relays) | City coordinates |
| [`/www/relays/all/`](https://api.mullvad.net/www/relays/all/) | WireGuard and bridge status, ownership, provider, speed, STBoot, DAITA, IPs, and messages |

Mullvad also provides a third-party-oriented [public WireGuard API](https://api.mullvad.net/public/relays/wireguard/v2), but it does not include bridge relays. The app and website endpoints can change, so all responses are decoded at runtime and stale KV data is retained for recovery.

No account or VPN connection data is collected. The rate-limit key uses Cloudflare's connecting IP only inside the native rate-limit binding. The application does not store it.

This project is not affiliated with or endorsed by Mullvad VPN AB.
