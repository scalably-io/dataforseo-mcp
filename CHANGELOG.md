# Changelog

## 1.0.0

- First public release.
- Derived from: `container/tools/dataforseo-proxy` at `ef174fc3` (2026-08-31) in the private ScalablyAI repository.
- Changes from production: the private tool-outcome envelope (`schema`, `changed` fields) is replaced by a plain JSON reply with the same `status`/`operation`/`summary`/`target`/`result`/`proof`/`warnings`/`recovery` fields; `outcome.ts` renamed `normalize.ts`; no functional change to the relay or normalization logic.
- Architecture: this server does not use fastmcp. It spawns the pinned `dataforseo-mcp-server@3.1.1` child process and relays JSON-RPC over stdio, normalizing only the `tools/call` responses; `tools/list` is relayed unchanged, so the four tool descriptors and their annotations come from the upstream package, not from this wrapper.
- Build changes: a shebang line so the npm `bin` runs; the child binary is resolved from this package's own `node_modules/.bin/dataforseo-mcp-server`; the e2e test uses `localhost`-only fixtures and the current protocol version.
