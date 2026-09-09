# Changelog

## 1.0.1

- Failures surface as a tool error reading `<code>: <message> <hint>`, as the README promised; 1.0.0 returned a JSON object with `status: failed` instead.
- The clean-install smoke runs with no credentials, proving `tools/list` needs none (1.0.0 injected placeholders and claimed the upstream refused to start without them, which is not the case).
- README and server.json document the test-only `NODE_ENV` and `DATAFORSEO_PROXY_TEST_CHILD` variables and the `operation` reply key; CI validates `manifest.json` again.

## 1.0.0

- First public release.
- Derived from: `container/tools/dataforseo-proxy` at `ef174fc3` (2026-08-31) in the private ScalablyAI repository.
- Changes from production: the private tool-outcome envelope (`schema`, `changed` fields) is replaced by a plain JSON reply with the same `status`/`operation`/`summary`/`target`/`result`/`proof`/`warnings`/`recovery` fields; `outcome.ts` renamed `normalize.ts`; no functional change to the relay or normalization logic.
- Architecture: this server does not use fastmcp. It spawns the pinned `dataforseo-mcp-server@3.1.1` child process and relays JSON-RPC over stdio, normalizing only the `tools/call` responses; `tools/list` is relayed unchanged, so the four tool descriptors and their annotations come from the upstream package, not from this wrapper.
- Build changes: a shebang line so the npm `bin` runs; the child binary is resolved from this package's own `node_modules/.bin/dataforseo-mcp-server`; the e2e test uses `localhost`-only fixtures and the current protocol version.
