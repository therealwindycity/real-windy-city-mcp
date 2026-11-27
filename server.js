#!/usr/bin/env node
// The Real Windy City MCP server.
//   stdio (Claude Desktop, Cursor, etc.):  npx -y github:therealwindycity/real-windy-city-mcp
//   web (Claude.ai / ChatGPT connectors):   PORT=8000 node server.js --http   → POST /mcp
// Optional settings (environment variables):
//   MCP_KEY       if set, the web address becomes /mcp/<MCP_KEY> (keeps strangers out)
//   GITHUB_TOKEN  lets update_comment_status change feedback statuses
//   RWC_SITE_URL  read data from a different copy of the site
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAll } from "./src/tools.js";
import { SITE, DEV_SITE, BETA_SITE } from "./src/data.js";

const INSTRUCTIONS = `The Real Windy City: Cheyenne, Wyoming city government meetings 2008–2026 (${SITE}).
Tools cover meetings, speaker video clips, the most heated moments, speakers, Who's Who (people, companies, agencies), ordinances from 1st reading to final vote, meeting documents, where the records come from, and the click-to-comment feedback from the developer copy (${DEV_SITE}) and beta copy (${BETA_SITE}).
Start with site_overview or search. Always give the user the page/video links returned by the tools. Speak in plain English, no jargon. Some speaker names were assigned by software; when a result says speakerConfirmed: false, say so.`;

function makeServer() {
  const server = new McpServer({ name: "real-windy-city", title: "The Real Windy City", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerAll(server);
  return server;
}

const wantHttp = process.argv.includes("--http") || (process.env.PORT && !process.argv.includes("--stdio"));

if (!wantHttp) {
  const server = makeServer();
  await server.connect(new StdioServerTransport());
} else {
  const PORT = Number(process.env.PORT || 8000);
  const KEY = process.env.MCP_KEY || "";
  const MCP_PATH = KEY ? `/mcp/${KEY}` : "/mcp";
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  };
  const readBody = (req) => new Promise((res, rej) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on("end", () => res(d)); req.on("error", rej); });
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain", ...cors }); return res.end("ok"); }
    if (url.pathname === MCP_PATH || url.pathname === MCP_PATH + "/") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json", Allow: "POST", ...cors });
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST (stateless MCP server)" }, id: null }));
      }
      try {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : undefined;
        const server = makeServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => { transport.close(); server.close(); });
        for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) {
        if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json", ...cors }); res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(e.message || e) }, id: null })); }
      }
      return;
    }
    if (url.pathname === "/" ) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...cors });
      return res.end(`<!doctype html><meta charset="utf-8"><title>The Real Windy City MCP</title><body style="font:16px system-ui;max-width:720px;margin:40px auto;padding:0 16px">
<h1>The Real Windy City — MCP server</h1><p>This address connects AI assistants (Claude, ChatGPT and others) to Cheyenne city meetings, speaker clips, heated moments, ordinances, documents, Who's Who and the site feedback.</p>
<p>${KEY ? "The connector address was given to the site owner." : `Connector address: <code>${(req.headers["x-forwarded-proto"] || "https")}://${req.headers.host}/mcp</code>`}</p>
<p>Public site: <a href="${SITE}">${SITE}</a></p></body>`);
    }
    res.writeHead(404, { "Content-Type": "text/plain", ...cors }); res.end("Not found");
  }).listen(PORT, "0.0.0.0", () => console.log(`Real Windy City MCP listening on :${PORT}${MCP_PATH}`));
}
