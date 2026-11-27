import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "t", version: "1" });
await c.connect(new StreamableHTTPClientTransport(new URL(process.argv[2])));
const [name, args] = [process.argv[3], JSON.parse(process.argv[4] || "{}")];
const r = await c.callTool({ name, arguments: args });
console.log(r.isError ? "ERROR" : "ok", r.content[0].text.slice(0, 1500));
await c.close();
