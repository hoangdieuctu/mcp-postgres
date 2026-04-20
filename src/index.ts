import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import express from "express";

config();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: parseInt(process.env.POSTGRES_PORT ?? "5432"),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const PORT = parseInt(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "127.0.0.1";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Fatal: API_KEY environment variable is required");
  process.exit(1);
}

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}


const WRITE_PATTERN = /^\s*(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy|vacuum|analyze|reindex|cluster)\b/i;

function createMcpServer(): Server {
  const server = new Server(
    { name: "mcp-postgres", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "query",
        description: "Execute a read-only SQL query (SELECT, EXPLAIN, SHOW, WITH...SELECT). Use 'execute' for write operations.",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "A read-only SQL query" },
          },
          required: ["sql"],
        },
      },
      {
        name: "execute",
        description: "Execute a write SQL statement (INSERT, UPDATE, DELETE, DDL). Requires confirm=true to prevent accidental data modification. Always show the SQL to the user and ask for confirmation before calling this tool.",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "The write SQL statement to execute" },
            confirm: { type: "boolean", description: "Must be true — confirms the user has acknowledged the write operation" },
          },
          required: ["sql", "confirm"],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in a given schema (defaults to public)",
        inputSchema: {
          type: "object",
          properties: {
            schema: { type: "string", description: "Schema name (default: public)" },
          },
        },
      },
      {
        name: "describe_table",
        description: "Describe the columns, types, and constraints of a table",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string", description: "Table name" },
            schema: { type: "string", description: "Schema name (default: public)" },
          },
          required: ["table"],
        },
      },
      {
        name: "list_schemas",
        description: "List all schemas in the database",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "query": {
          const sql = (args as { sql: string }).sql;
          if (WRITE_PATTERN.test(sql.trim())) {
            return {
              content: [{ type: "text", text: "Error: Use the 'execute' tool for write operations." }],
              isError: true,
            };
          }
          const result = await pool.query(sql);
          return {
            content: [{ type: "text", text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2) }],
          };
        }

        case "execute": {
          const { sql, confirm } = args as { sql: string; confirm: boolean };
          if (!confirm) {
            return {
              content: [{ type: "text", text: "Aborted: confirm must be true. Show the SQL to the user and ask for confirmation first." }],
              isError: true,
            };
          }
          const result = await pool.query(sql);
          return {
            content: [{ type: "text", text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2) }],
          };
        }

        case "list_tables": {
          const schema = (args as { schema?: string }).schema ?? "public";
          const result = await pool.query(
            `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
            [schema]
          );
          return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
        }

        case "describe_table": {
          const { table, schema = "public" } = args as { table: string; schema?: string };
          const result = await pool.query(
            `SELECT
               c.column_name, c.data_type, c.character_maximum_length,
               c.is_nullable, c.column_default,
               (
                 SELECT string_agg(tc.constraint_type, ', ')
                 FROM information_schema.key_column_usage kcu
                 JOIN information_schema.table_constraints tc
                   ON tc.constraint_name = kcu.constraint_name
                   AND tc.table_schema = kcu.table_schema
                 WHERE kcu.table_schema = c.table_schema
                   AND kcu.table_name = c.table_name
                   AND kcu.column_name = c.column_name
               ) AS constraints
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position`,
            [schema, table]
          );
          return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
        }

        case "list_schemas": {
          const result = await pool.query(
            `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`
          );
          return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
        }

        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Database error: ${message}` }], isError: true };
    }
  });

  return server;
}

async function main() {
  await pool.connect();

  const app = createMcpExpressApp({ host: HOST });
  app.use(express.json());

  // Map of session ID -> transport (for stateful sessions)
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", requireApiKey, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Reuse existing transport for this session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session: create a fresh server + transport pair
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport); },
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(PORT, HOST, () => {
    console.log(`mcp-postgres listening on http://${HOST}:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
