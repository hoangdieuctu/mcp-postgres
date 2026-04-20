# mcp-postgres

Read-only PostgreSQL MCP server using **Streamable HTTP transport**.

Exposes 4 tools to Claude:

| Tool | Description |
|---|---|
| `query` | Run a SELECT query |
| `list_tables` | List tables in a schema |
| `describe_table` | Show columns/types/constraints |
| `list_schemas` | List all schemas |

## Setup

```bash
npm install
npm run build
```

## Run

```bash
POSTGRES_DB=mydb POSTGRES_USER=me POSTGRES_PASSWORD=secret npm start
```

Server starts at `http://127.0.0.1:3000/mcp`.

## Environment variables

| Variable | Default | Required |
|---|---|---|
| `POSTGRES_HOST` | `localhost` | No |
| `POSTGRES_PORT` | `5432` | No |
| `POSTGRES_DB` | — | Yes |
| `POSTGRES_USER` | — | Yes |
| `POSTGRES_PASSWORD` | — | Yes |
| `POSTGRES_SSL` | `false` | No |
| `HOST` | `127.0.0.1` | No |
| `PORT` | `3000` | No |

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postgres": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

> Credentials stay on your server — Claude Desktop only connects to the HTTP endpoint.
