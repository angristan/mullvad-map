# Mullvad Relay Map

An unofficial interactive map of Mullvad VPN infrastructure. Explore relay locations, status, ownership, providers, listed capacity, capabilities, and experimental browser latency estimates.

**Live:** [mullvad-map.angristan.workers.dev](https://mullvad-map.angristan.workers.dev)

## Features

- Responsive MapLibre globe with one node per matching relay location
- Search and filters for status, relay type, ownership, provider, and DAITA
- Sortable location table with relay count, listed capacity, and estimated latency
- Relay-level details including addresses, port speed, provider, STBoot, and notices
- Cloudflare Worker API with runtime validation, KV caching, and native rate limiting

## Experimental latency testing

Latency testing is manual and intended only for relative ranking. Starting a test makes three direct TLS connection attempts for each matching active WireGuard location. Tests run six locations at a time and time out after 2.5 seconds.

For one relay in each location, the browser times expected-to-fail TLS connections to its literal IPv4 address on port 443:

```text
estimated RTT = median connection duration / 4
```

Mullvad relays can observe the connection's network egress IP and timing. TLS currently fails before an HTTP request is sent, but this depends on Mullvad's port behavior. The result is not ICMP latency and does not measure VPN tunnel performance. Browser networking changes can invalidate the calibration.

Filtering before starting a test reduces the number of direct connections. A full run attempts `3 × matching locations` connections.

## Local development

Requirements: [Bun](https://bun.sh/) 1.3.9.

```bash
bun install --frozen-lockfile
bun run typegen
bun run dev
```

Open the IPv4 URL printed by Vite. The Cloudflare Vite plugin runs the API in `workerd`; local KV data is persisted by Wrangler.

## Validation

```bash
bun run check
```

This checks generated Worker types, runs unit and Workerd integration tests, builds the client and Worker, and performs a Wrangler dry run.

## Architecture

```text
Browser
  ├─ static files ───────────────> Cloudflare Static Assets
  ├─ map/style/tile requests ────> OpenFreeMap
  ├─ optional TLS probes ────────> Mullvad relays
  └─ /api/*
       └─ native rate limiter
            └─ Effect relay service
                 ├─ fresh KV snapshot ─────────> response
                 ├─ stale KV snapshot ─────────> response + background refresh
                 └─ cache miss ─> Mullvad APIs ─> KV ─> response
```

Static files bypass Worker execution. Only `/api/*` invokes Hono. See [Architecture](docs/architecture.md) for cache behavior, API details, and latency visualization.

## Deployment

The project deploys as one Cloudflare Worker with Static Assets. See [Deployment](docs/deployment.md) for manual setup, Workers Builds automatic deployment, smoke tests, and rollback.

## Data and privacy

The Worker joins two Mullvad-hosted endpoints used by Mullvad's app and website:

| Endpoint | Used for |
| --- | --- |
| [`/app/v1/relays`](https://api.mullvad.net/app/v1/relays) | City coordinates |
| [`/www/relays/all/`](https://api.mullvad.net/www/relays/all/) | Relay status, ownership, provider, speed, capabilities, addresses, and notices |

These endpoints can change, so responses are decoded at runtime and stale KV data is retained for recovery.

- Cloudflare processes normal site and API requests.
- OpenFreeMap receives browser requests for map styles, sprites, and tiles.
- The Worker uses the connecting IP only as a native rate-limit key and does not persist it.
- Cloudflare edge coordinates are used only to order latency candidates and are not persisted.
- User-initiated latency tests connect directly to Mullvad relays as described above.
- Workers Logs and traces follow the sampling configured in `wrangler.jsonc`.

This project is not affiliated with or endorsed by Mullvad VPN AB.
