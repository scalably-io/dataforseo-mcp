# DataForSEO MCP

A thin wrapper around [DataForSEO's official MCP server](https://github.com/dataforseo/mcp-server-typescript) that adds a searchable docs index and normalized errors. If you only need the raw API, install `dataforseo-mcp-server` directly.

<!-- mcp-name: io.scalably/dataforseo-mcp -->

## Install

Claude Code:

```bash
claude mcp add dataforseo -e DATAFORSEO_USERNAME=your-login -e DATAFORSEO_PASSWORD=your-password -- npx -y @scalably-io/dataforseo-mcp
```

Codex:

```bash
codex mcp add dataforseo --env DATAFORSEO_USERNAME=your-login --env DATAFORSEO_PASSWORD=your-password -- npx -y @scalably-io/dataforseo-mcp
```

Claude Desktop: download `dataforseo-mcp.mcpb` from the latest GitHub release and open it.

## Setup

1. Create or open a DataForSEO account at dataforseo.com.
2. Read the API login (an email address) and API password from the dashboard.
3. `api_request` calls the live DataForSEO API and can incur cost per DataForSEO's own pricing; the three `docs_*` tools are free documentation lookups.

## Tools (4)

| Tool | What it does |
|---|---|
| `docs_index` | Fetch the DataForSEO API documentation index (llms.txt), optionally filtered by section |
| `docs_list_sections` | Return available DataForSEO API documentation section names |
| `docs_search` | Fetch DataForSEO API documentation from a documentation URL |
| `api_request` | Make an authenticated request to the DataForSEO API (method, path or url, body, and an optional noAiMode flag for the full, non AI-optimized response) |

Use `docs_list_sections` or `docs_index` to pick an API family, then `docs_search` for the exact current endpoint path, method, request body and pricing before calling `api_request`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATAFORSEO_USERNAME` | yes | DataForSEO account login (email) from the dashboard |
| `DATAFORSEO_PASSWORD` | yes | DataForSEO account API password from the dashboard |

## Reply shape

Every tool returns plain JSON with `status` (`succeeded`, `partial`, `no_op`), `summary`, `target`, `result`, `proof`, `warnings`, `recovery`. Failures throw a plain error string: `<code>: <message> <hint>`. `api_request` normalizes DataForSEO's per-task status codes (pending tasks, no-result tasks, partial failures, and vendor error codes) into that shape instead of returning DataForSEO's raw task envelope unexamined.

## Limits

`api_request` is a real, billable call to the DataForSEO API; DataForSEO's own account balance and rate limits apply. A failed call to a paid endpoint is reported with an `ambiguous_paid_request` error when the outcome could not be confirmed, since retrying blind could double the charge.

## Verify

Each release lists the package version, the `.mcpb` sha256 and the production commit it was derived from in CHANGELOG.md. CI runs the tests and a clean install of the packed tarball on every push.

## Privacy Policy

This server runs locally, on your machine, under your own credentials. It collects no personal data, contains no telemetry, stores nothing persistently, and talks only to the vendor API it wraps. No third party, including Scalably, receives your data. Contact: hello@scalably.io. Canonical copy: https://scalably.io/connector-privacy.html

## License

MIT. Copyright Scalably.
