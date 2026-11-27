# The Real Windy City: MCP server

This lets AI assistants such as Claude, ChatGPT, Cursor and VS Code look things up in **The Real Windy City** records (Cheyenne, Wyoming city meetings, 2008–2026). They can also read, add and close the **feedback notes** left on the developer and beta copies of the site.

It reads straight from the live site (https://therealwindycity.github.io/real-windy-city-tv/), so it is always up to date. There is no database to keep in sync.

## What the assistant can do (24 tools)

| Area | Tools | Ask things like… |
|---|---|---|
| Start here | `site_overview`, `search`, `fetch` | "What's in The Real Windy City?" · "Search everything for Cox Ranch" |
| Meetings | `search_meetings`, `get_meeting`, `featured_meeting` | "What happened at the Nov 23, 2026 council meeting?" |
| Speaker clips | `search_speaker_clips`, `get_speaker_clip` | "Clips of residents opposing the data center rules" |
| 🔥 Heated moments | `heated_moments` | "Show me every time the chair cut someone off in 2026" |
| Speakers & people | `list_speakers`, `get_speaker`, `list_people` | "What does Mark Moody usually vote against?" |
| Who's Who | `whos_who`, `get_whos_who_profile` | "Who is behind Cheyenne LEADS?" |
| Ordinances | `search_ordinances`, `get_ordinance` | "Where is the annexation near Roundtop Road?" |
| Documents | `search_documents`, `get_document` (includes scanned text) | "Find the 2017 parking plan and summarize it" |
| Where the records come from | `where_records_come_from` | "How do I know these records are real?" |
| Feedback notes | `feedback_summary`, `list_comments`, `get_comment`, `leave_comment`, `update_comment_status` | "What's still not fixed on the beta site?" · "Mark #4 fixed: renamed the button" |

It also comes with ready-made requests (prompts): **Brief me on a meeting**, **Everything on a topic**, **Go through the site comments**.

Marking notes fixed or reopening them requires the server to have a GitHub token (`GITHUB_TOKEN`). Without one, everything else still works.

---

## Option A: Claude Desktop, Cursor, VS Code, Windsurf (runs on your computer)

You need [Node.js](https://nodejs.org) 18 or newer installed. Nothing else is required.

**Claude Desktop:** Settings → Developer → Edit Config, then paste:

```json
{
  "mcpServers": {
    "real-windy-city": {
      "command": "npx",
      "args": ["-y", "github:therealwindycity/real-windy-city-mcp"],
      "env": { "GITHUB_TOKEN": "optional – only needed to mark feedback notes fixed" }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the 🔌 / tools menu.

**Cursor:** the same block goes in `~/.cursor/mcp.json`.
**VS Code:** run `MCP: Add Server` → *Command (stdio)* → `npx -y github:therealwindycity/real-windy-city-mcp`.
**Claude Code:** `claude mcp add real-windy-city -- npx -y github:therealwindycity/real-windy-city-mcp`

## Option B: Claude.ai, ChatGPT and other web apps (needs a web address)

Web apps need the server running at a public `https://` address.

1. **Put it online for free (one time, about 3 minutes):**
   - Click this button. It opens Render and asks you to sign in with GitHub:
     [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/therealwindycity/real-windy-city-mcp)
   - When it asks for `MCP_KEY`, type any secret word, for example `cheyenne-7391`. This keeps strangers from using it.
   - `GITHUB_TOKEN` is optional. Add it only if you want the assistant to be able to mark notes fixed.
   - Your address will be `https://YOUR-APP.onrender.com/mcp/YOUR-SECRET-WORD`.
   - On the free plan the server falls asleep after 15 minutes of no use. The first question after that takes about 30 seconds while it wakes up.
2. **Claude.ai:** Settings → Connectors → *Add custom connector* → paste the address → Add. In a chat, turn it on from the 🔌 menu.
3. **ChatGPT:** Settings → Apps & Connectors → Advanced → turn on *Developer mode* → *Create* → paste the address, Authentication: *No authentication* → Create.

Railway, Fly.io and any other Node host also work. The start command is `npm start` and the server listens on `$PORT`.

## Settings (environment variables)

| Name | What it does |
|---|---|
| `MCP_KEY` | Secret word. When set, the web address becomes `/mcp/<MCP_KEY>`. |
| `GITHUB_TOKEN` | Lets `update_comment_status` change feedback notes in `real-windy-city-tv-dev`. |
| `PORT` | Web port (Render/Railway set this for you). Setting it switches the server to web mode. |
| `RWC_SITE_URL` | Read from a different copy of the site, for example the dev copy. |
| `RWC_CACHE_SECONDS` | How long to remember site data before re-reading it (default 900). |

## Run it yourself

```bash
npm install
node server.js            # for desktop apps (stdio)
PORT=8000 node server.js  # web mode → http://localhost:8000/mcp
node test/client.mjs      # quick self-test of every tool
```

Notes: speaker names on some clips were assigned by software. When that's the case the tools say `speakerConfirmed: false`. Heated-moment rankings are automatic, so watch the clip before quoting it.
