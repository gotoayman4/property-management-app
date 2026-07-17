# ADR-001: Online Exchange Rate Fetch Exception

## Status

Accepted

## Context

AGENTS.md forbids all network access: "No fetch to external URLs", "No REST/GraphQL API clients (axios, fetch to external URLs)". This is a core guardrail for the offline-first property management app.

SRS FR-FX-01 explicitly allows **one optional** online exchange rate fetch: "A 'fetch online' button that retrieves the latest rate for a selected currency pair from a public API (e.g. exchangerate.host)."

These two rules appear contradictory.

## Decision

Allow a **single, user-initiated, offline-default** exchange rate fetch as a documented exception to the no-network rule:

1. **User-initiated only**: The fetch is triggered by an explicit button click ("Fetch Online" in the exchange rate management UI). No automatic/background fetching.
2. **Offline-default**: The app works fully without network access. Rates are entered manually. The online fetch is a convenience, not a requirement.
3. **No persistent network client**: Use Electron's `net.fetch()` (not `axios` or global `fetch`) to avoid introducing a network dependency. The call is wrapped in a try/catch that degrades gracefully to "network unavailable — enter rate manually."
4. **Single API only**: The fetch targets a single public API endpoint. No API keys are stored. No user data is transmitted.
5. **Audit trail**: Every online-fetched rate is tagged with `source: 'online'` and `fetched_at` timestamp in the `exchange_rates` table. Manual entries use `source: 'manual'`.

## Consequences

- The no-network rule remains the default. This ADR documents the single exception.
- Future AI sessions can reference this ADR if they encounter the apparent contradiction.
- The feature can be disabled entirely by removing the "Fetch Online" button without affecting any other functionality.
- No new network-related dependencies are introduced (`net.fetch` is built into Electron).
