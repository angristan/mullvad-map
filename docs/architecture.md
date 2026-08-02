# Architecture

## Runtime boundaries

The application deploys as one Cloudflare Worker project:

- Cloudflare Static Assets serves the React application without invoking Worker code.
- Hono handles only `/api/*` routes.
- TanStack Query owns browser caching and request cancellation.
- Effect decodes external data and coordinates Worker cache and upstream services.
- MapLibre renders the globe; OpenFreeMap supplies the style and tiles.

The API exposes:

| Route | Behavior |
| --- | --- |
| `GET /api/health` | Uncached liveness response |
| `GET /api/relays` | Normalized relay snapshot with ETag and cache metadata |
| `GET /api/latency-candidates` | Active WireGuard location keys ordered from the visitor's Cloudflare edge when coordinates are available |

`/api/relays` and `/api/latency-candidates` each have a separate limit of 120 requests per minute, per connecting IP and Cloudflare location. This is not a global abuse limit. Users behind one NAT or VPN exit share a key and can receive collateral `429` responses.

## Relay cache

The Worker stores a normalized snapshot in KV:

- Snapshots are fresh for 15 minutes.
- KV retains snapshots for seven days.
- A fresh snapshot returns as a cache hit.
- A stale snapshot returns immediately while the request schedules a bounded refresh with `waitUntil()`.
- A cache miss waits for both Mullvad-hosted endpoints.
- Invalid upstream and KV payloads fail runtime decoding.
- Failed cache reads fall back to the upstream sources.
- Failed cache writes do not discard a fresh upstream response.

KV is eventually consistent. Concurrent cold or stale requests can refresh the same snapshot independently in different invocations or Cloudflare locations. The Worker deliberately does not share request-owned I/O through module state.

## Globe rendering

Each matching location is represented once; nodes are never clustered. Node area reflects the square-root-scaled sum of active relays' listed port capacity, bounded for readability. Capacity is nominal and is not current utilization or guaranteed throughput.

Map markers remain mounted during camera movement. MapLibre handles globe occlusion, covered nodes are non-interactive, and opacity transitions smooth movement across the horizon.

## Latency ranking

The browser tests one active WireGuard relay per matching location. It makes three direct TLS connection attempts to the relay's literal IPv4 address on port 443. Six locations are processed concurrently, with a 2.5-second timeout per attempt.

Mullvad currently serves an obfuscation protocol rather than HTTPS on that port, so the TLS failure is expected. The estimate uses local Chromium calibration:

```text
estimated RTT = median failed-TLS duration / 4
```

This is an experimental relative ranking heuristic, not ICMP latency or VPN tunnel performance. Mullvad relays can observe the connection's network egress IP and timing. TLS currently fails before HTTP, but that can change with Mullvad's service behavior.

While a test runs, pending or unavailable nodes are gray. Completed nodes use a logarithmic green-to-pink scale normalized between the run's 10th and 90th percentiles. Results and sorting update progressively.
