# mcp-postgres

PostgreSQL MCP server with read and write support over **Streamable HTTP transport**.

Exposes 5 tools to Claude:

| Tool | Description |
|---|---|
| `query` | Run a read-only SQL query (SELECT, EXPLAIN, SHOW, WITH…SELECT) |
| `execute` | Run a write SQL statement (INSERT, UPDATE, DELETE, DDL) — requires `confirm: true` |
| `list_tables` | List tables in a schema |
| `describe_table` | Show columns, types, and constraints |
| `list_schemas` | List all schemas |

The `execute` tool requires `confirm: true` so Claude must show the SQL to the user and get explicit confirmation before any write operation runs.

## Docker (recommended)

Pull and run from Docker Hub:

```bash
docker run -d \
  -e API_KEY=secret \
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_DB=mydb \
  -e POSTGRES_USER=me \
  -e POSTGRES_PASSWORD=secret \
  -p 3000:3000 \
  hoangdieuctu/mcp-postgres:1.0.0
```

Server starts at `http://127.0.0.1:3000/mcp`.

## Setup (from source)

```bash
npm install
npm run build
```

## Run (from source)

```bash
API_KEY=secret POSTGRES_DB=mydb POSTGRES_USER=me POSTGRES_PASSWORD=secret npm start
```

Server starts at `http://127.0.0.1:3000/mcp`.

## Environment variables

| Variable | Default | Required |
|---|---|---|
| `API_KEY` | — | Yes |
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
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

> Credentials stay on your server — Claude Desktop only connects to the HTTP endpoint.
