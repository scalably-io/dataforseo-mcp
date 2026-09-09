# Releasing

This package ships on npm only. There is no `.mcpb` bundle: the upstream `dataforseo-mcp-server` lists Cloudflare Worker tooling as production dependencies, which would make a bundle over 100 MB. Claude Desktop users install the upstream server directly.

1. Bump `version` in `package.json`, `manifest.json` and `server.json`; add a CHANGELOG entry; keep `server.json` `description` at 100 characters or fewer; `npm test`, the scanner; commit.
2. First version of a new package only: `npm ci && npm run build && npm publish --access public` from the maintainer's logged-in terminal (npm asks for the 2FA code), then add the trusted publisher on `npmjs.com/package/@scalably-io/dataforseo-mcp/access`: GitHub, organization `scalably-io`, repository `dataforseo-mcp`, workflow `release.yml`, environment `npm`.
3. Tag and push: `git tag v<version> && git push origin main --tags`. CI publishes to npm by trusted publishing (skipped when the version is already there) and creates the GitHub release with no assets.
4. Confirm: `npm view @scalably-io/dataforseo-mcp version`.
5. Registry (local, maintainer's Mac only; on macOS use `/opt/homebrew/opt/openssl@3/bin/openssl`): `PRIVATE_KEY="$(openssl pkey -in ~/.config/scalably/mcp-registry/key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :
')"` then `mcp-publisher login dns --domain scalably.io --private-key "$PRIVATE_KEY"` and `mcp-publisher publish`.
6. Confirm: `curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=io.scalably/dataforseo-mcp'` lists the version.
