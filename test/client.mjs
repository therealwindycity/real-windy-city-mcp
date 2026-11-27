import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const url = process.argv[2];
const transport = url ? new StreamableHTTPClientTransport(new URL(url)) : new StdioClientTransport({ command: "node", args: ["server.js"] });
const c = new Client({ name: "test", version: "1" });
await c.connect(transport);
const tools = (await c.listTools()).tools;
console.log("TOOLS", tools.length, tools.map((t) => t.name).join(", "));
console.log("PROMPTS", (await c.listPrompts()).prompts.map((p) => p.name).join(", "));
console.log("RESOURCES", (await c.listResources()).resources.map((p) => p.uri).join(", "));
const calls = url ? [["site_overview", {}], ["heated_moments", { limit: 2 }]] : [
  ["site_overview", {}], ["search", { query: "data center" }], ["search_meetings", { query: "annexation", limit: 3 }],
  ["get_meeting", { slug: "__LATEST__" }], ["featured_meeting", {}], ["search_speaker_clips", { query: "water", limit: 3 }],
  ["get_speaker_clip", { id: 368 }], ["heated_moments", { limit: 3 }], ["heated_moments", { reason: "cut_off", limit: 2 }],
  ["list_speakers", { limit: 5 }], ["get_speaker", { slug: "Miller" }], ["list_people", { query: "mayor" }],
  ["whos_who", { limit: 3 }], ["get_whos_who_profile", { slug: "__WHO__" }], ["search_ordinances", { query: "zoning", limit: 3 }],
  ["get_ordinance", { slug: "__ORD__" }], ["search_documents", { query: "budget", searchableTextOnly: true, limit: 3 }], ["get_document", { id: "__DOC__", maxChars: 800 }],
  ["where_records_come_from", {}], ["feedback_summary", {}], ["list_comments", { status: "all" }], ["fetch", { id: "clip:368" }],
];
const ctx = {};
for (let [name, args] of calls) {
  for (const k in args) if (typeof args[k] === "string" && args[k].startsWith("__")) args[k] = ctx[args[k]];
  const t0 = Date.now();
  const r = await c.callTool({ name, arguments: args });
  const txt = r.content[0].text;
  (await import("node:fs")).writeFileSync(`/tmp/mcpout_${name}${args.reason||""}.json`, txt);
  console.log(`\n=== ${name} ${JSON.stringify(args)} ${r.isError ? "ERROR" : "ok"} ${txt.length}ch ${Date.now() - t0}ms\n` + txt.slice(0, 700));
  try {
    const j = JSON.parse(txt);
    if (name === "site_overview") ctx.__LATEST__ = j.latestMeeting.slug;
    if (name === "whos_who") ctx.__WHO__ = j.profiles[0].slug;
    if (name === "search_ordinances") ctx.__ORD__ = j.ordinances[0].slug;
    if (name === "search_documents") ctx.__DOC__ = j.documents[0].id;
  } catch {}
}
await c.close();
