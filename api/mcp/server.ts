// HD-Search MCP server (spec §8: "the product will also have an MCP server").
// Exposes the aggregator as MCP tools so any MCP client (Claude, IDEs, agents)
// can search/crawl/vector-search. It is a thin client over the HTTP API and
// authenticates with an sk-hds- API key (HDSEARCH_API_KEY), so all quota, rate
// limiting and per-user provider keys apply exactly as for HTTP callers.
//
// Transports (pick one):
//   • Streamable HTTP (default for a hosted service): `node dist/mcp/server.js --http`
//     — clients connect to http://<host>:<MCP_PORT>/mcp and authenticate with their
//     OWN key via `Authorization: Bearer sk-hds-...` (per-caller scopes/rate-limit).
//   • stdio (local clients that spawn the process): default; uses HDSEARCH_API_KEY.
//   HDSEARCH_API_URL   default http://127.0.0.1:8791
//   HDSEARCH_API_KEY   required for stdio; the fallback key for http if no header
//   MCP_TRANSPORT=http | --http   run the Streamable HTTP server
//   MCP_PORT           http listen port (default 8792)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = (process.env.HDSEARCH_API_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');
const ENV_API_KEY = process.env.HDSEARCH_API_KEY || '';

async function api(apiKey: string, path: string, body?: unknown, method = 'POST'): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? method : 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`hd-search API ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

const TOOLS = [
  {
    name: 'hd_search',
    description:
      'Search the internet across aggregated engines (web/news/images/videos/scholar/places/shopping/code/social/archive/darkweb). Priority-ordered fallback or aggregate fan-out with dedup.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'search query' },
        modality: { type: 'string', enum: ['web', 'news', 'images', 'videos', 'scholar', 'places', 'shopping', 'code', 'social', 'archive', 'darkweb'], default: 'web' },
        engine: { type: 'string', description: 'force a specific engine id (e.g. brave, serpapi, ahmia)' },
        mode: { type: 'string', enum: ['fallback', 'aggregate'], default: 'fallback' },
        limit: { type: 'integer', default: 10 },
        facets: { type: 'boolean', default: false },
      },
      required: ['q'],
    },
  },
  {
    name: 'hd_crawl',
    description: 'Crawl a URL and return normalized markdown/text/links/images. Uses self-hosted crawlers first, commercial fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        formats: { type: 'array', items: { type: 'string', enum: ['markdown', 'text', 'html', 'links', 'images'] } },
        render: { type: 'boolean', description: 'render JS via headless browser if available' },
      },
      required: ['url'],
    },
  },
  {
    name: 'hd_vector_search',
    description: 'Semantic (vector) KNN search over a previously indexed namespace. Optionally ground with live web results first.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        namespace: { type: 'string', default: 'default' },
        k: { type: 'integer', default: 10 },
        groundWithWeb: { type: 'boolean', default: false },
      },
      required: ['q'],
    },
  },
  {
    name: 'hd_vector_index',
    description: 'Embed and index documents into a namespace with a TTL (default 24h) for later vector search.',
    inputSchema: {
      type: 'object',
      properties: {
        documents: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' } }, required: ['text'] } },
        namespace: { type: 'string', default: 'default' },
        ttl: { type: 'integer' },
      },
      required: ['documents'],
    },
  },
  {
    name: 'hd_list_engines',
    description: 'List the available search/crawl engines, their modalities, access type and whether they are available to you.',
    inputSchema: { type: 'object', properties: { category: { type: 'string', enum: ['search', 'crawl', 'darkweb'] }, modality: { type: 'string' } } },
  },
];

// Build a Server bound to a specific caller's API key (so HTTP requests use the
// key from their Authorization header, and stdio uses the env key).
function buildServer(apiKey: string): Server {
  const server = new Server({ name: 'hd-search', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      let result: unknown;
      switch (name) {
        case 'hd_search':
          result = await api(apiKey, '/v1/search', args);
          break;
        case 'hd_crawl':
          result = await api(apiKey, '/v1/crawl', args);
          break;
        case 'hd_vector_search':
          result = await api(apiKey, '/v1/search/vector', args);
          break;
        case 'hd_vector_index':
          result = await api(apiKey, '/v1/search/vector/index', args);
          break;
        case 'hd_list_engines': {
          const qs = new URLSearchParams();
          if ((args as any).category) qs.set('category', (args as any).category);
          if ((args as any).modality) qs.set('modality', (args as any).modality);
          result = await api(apiKey, `/v1/engines${qs.toString() ? `?${qs}` : ''}`, undefined, 'GET');
          break;
        }
        default:
          throw new Error(`unknown tool: ${name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
  return server;
}

// ---- stdio transport (local clients that spawn the process) ----
async function runStdio(): Promise<void> {
  if (!ENV_API_KEY) {
    process.stderr.write('hd-search MCP: HDSEARCH_API_KEY is required for stdio mode (sk-hds-...)\n');
    process.exit(1);
  }
  await buildServer(ENV_API_KEY).connect(new StdioServerTransport());
  process.stderr.write(`hd-search MCP (stdio) ready (api=${API_URL})\n`);
}

// ---- Streamable HTTP transport (network clients) ----
function bearer(req: IncomingMessage): string {
  const h = req.headers['authorization'];
  const m = /^Bearer\s+(.+)$/i.exec((Array.isArray(h) ? h[0] : h) || '');
  return (m?.[1] || ENV_API_KEY || '').trim();
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}
function isInitialize(body: unknown): boolean {
  const arr = Array.isArray(body) ? body : [body];
  return arr.some((m) => (m as any)?.method === 'initialize');
}

async function runHttp(port: number): Promise<void> {
  // Session registry: one transport (+ server) per initialized MCP session. The
  // client gets an `mcp-session-id` on initialize and sends it on every follow-up.
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'hd-search-mcp', transport: 'streamable-http' }));
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', hint: 'MCP endpoint is /mcp' }));
      return;
    }
    try {
      const sid = req.headers['mcp-session-id'] as string | undefined;
      const existing = sid ? sessions.get(sid) : undefined;
      if (existing) {
        const body = req.method === 'POST' ? await readJson(req).catch(() => undefined) : undefined;
        await existing.transport.handleRequest(req, res, body);
        return;
      }
      if (req.method === 'POST') {
        const body = await readJson(req).catch(() => undefined);
        if (isInitialize(body)) {
          const server = buildServer(bearer(req)); // bind this session to the caller's key
          const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              sessions.set(id, { transport, server });
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) sessions.delete(transport.sessionId);
          };
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        }
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No valid session — send an initialize request first' } }));
        return;
      }
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_request', message: 'missing mcp-session-id' }));
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: (e as Error).message } }));
      }
    }
  });
  httpServer.listen(port, () => process.stderr.write(`hd-search MCP (streamable-http) on :${port}/mcp (api=${API_URL})\n`));
}

async function main() {
  const httpMode = process.argv.includes('--http') || /^(http|streamable(-http)?)$/i.test(process.env.MCP_TRANSPORT || '');
  if (httpMode) await runHttp(Number(process.env.MCP_PORT) || 8792);
  else await runStdio();
}

main().catch((e) => {
  process.stderr.write(`hd-search MCP fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
