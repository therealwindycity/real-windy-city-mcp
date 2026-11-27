import { z } from "zod";
import {
  SITE, DEV_SITE, BETA_SITE, FEEDBACK_REPO, FEEDBACK_PATH, FACEBOOK,
  load, link, matchesAll, score, clip, clipSummary, clipVideo, heated, forgetComments, hms,
} from "./data.js";

const READ = { readOnlyHint: true, openWorldHint: true };
const out = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 1) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });
const lim = (n, d = 10, max = 50) => Math.max(1, Math.min(max, Number(n) || d));
const STANCES = ["Supports", "Opposes", "Questions & discussion", "Staff report", "Makes a motion", "Raises a point of order"];
const ROLES = ["Elected official", "City staff", "Resident", "Civic watchdog", "City board member", "Contractor or applicant", "Speaking for an organization"];
const BODIES = { council: "City Council", special: "Special council meeting", psc: "Public Services Committee", finance: "Finance Committee", cow: "Committee of the Whole", work: "Work session", other: "Other boards & commissions" };
const NTFY_TOPICS = { dev: "rwc-fb-dev-7f3c91a2d84e5b06", beta: "rwc-fb-beta-2b9e64c0f1a7d358" };
const STATUS_L = { open: "Not fixed yet", fixed: "Fixed, waiting for the owner's OK", confirmed: "Fixed (owner confirmed)", wontfix: "Won't change" };

const goodUrl = (u) => (u && String(u).length > 10 ? (String(u).startsWith("http") ? u : new URL(u, SITE).href) : undefined);
function meetingCard(e) {
  return { slug: e.slug, date: e.date, body: e.bodyName, title: e.title, summary: e.logline, tags: e.tags, runtimeMin: e.runtimeMin || undefined,
    agenda: goodUrl(e.agendaUrl), minutes: goodUrl(e.minutesUrl), video: goodUrl(e.mp4Url || e.videoUrl), page: link.meeting(e.slug) };
}
function ordinanceCard(o) {
  return { slug: o.slug, title: o.title, kind: o.kind, firstReading: o.firstDate, lastReading: o.lastDate, readings: (o.readings || []).length, page: link.ordinance(o.slug) };
}
function whoCard(e) {
  return { slug: e.slug, name: e.name, category: e.category, type: e.subtype, summary: clip(e.nexusSummary || e.role, 260), meetings: e.meetingCount || undefined };
}
function commentCard(c) {
  return { num: c.num, status: STATUS_L[c.status] || c.status, statusCode: c.status, from: c.site === "beta" ? `Beta tester: ${c.author || "anonymous"}` : "Site owner",
    kind: c.type, page: c.page, clicked: c.element, comment: c.comment, whatWasDone: c.fixNote || undefined, created: c.createdAt,
    followUps: (c.thread || []).map((t) => `${t.createdAt?.slice(0, 16)} ${t.author}: ${t.action}${t.note ? " — " + t.note : ""}`), selector: c.selector };
}

export function registerAll(server) {
  // ======================= OVERVIEW =======================
  server.registerTool("site_overview", {
    title: "Site overview",
    description: "What The Real Windy City contains (Cheyenne, Wyoming city meetings 2008–2026): counts, sections and links to the public site, the developer copy and the beta copy. Start here.",
    inputSchema: {}, annotations: READ,
  }, async () => {
    const [eps, turns, spk, who, ords, docs, h, fb] = await Promise.all([load.episodes(), load.turns(), load.speakers(), load.whosWho(), load.ordinances(), load.documents(), heated(), load.comments().catch(() => [])]);
    const years = [...new Set(eps.map((e) => e.season))].sort();
    return out({
      site: SITE, developerCopy: DEV_SITE, betaCopy: BETA_SITE, facebook: FACEBOOK,
      covers: `Cheyenne, Wyoming city government meetings ${years[0]}–${years[years.length - 1]}`,
      counts: { meetings: eps.length, meetingsWithVideo: eps.filter((e) => e.mp4Url || e.videoUrl).length, speakerClips: turns.length, speakers: spk.length, heatedMoments: h.length, ordinances: ords.length, documents: docs.length, whosWhoProfiles: who.length },
      latestMeeting: meetingCard(eps.filter((e) => e.phase !== "upcoming").sort((a, b) => b.date.localeCompare(a.date))[0]),
      sections: ["Meetings", "Speaker Clips", "🔥 Heated Moments", "Who's Who", "Ordinances", "Documents", "Where the Records Come From", "People"],
      feedback: { total: fb.length, notFixed: fb.filter((c) => c.status === "open").length, fixed: fb.filter((c) => ["fixed", "confirmed"].includes(c.status)).length },
      meetingBodies: BODIES,
    });
  });

  // ======================= CHATGPT-STYLE search / fetch =======================
  server.registerTool("search", {
    title: "Search everything",
    description: "Search the whole site at once: meetings, speaker clips, ordinances, documents, Who's Who and speakers. Returns ids you can pass to `fetch`.",
    inputSchema: { query: z.string().describe("Words to look for") }, annotations: READ,
  }, async ({ query }) => {
    const [eps, turns, ords, docs, who, spk] = await Promise.all([load.episodes(), load.turns(), load.ordinances(), load.documents(), load.whosWho(), load.speakers()]);
    const res = [];
    const add = (id, title, url, text, s) => { if (s > 0) res.push({ id, title, url, text: clip(text, 200), s }); };
    eps.forEach((e) => add(`meeting:${e.slug}`, `${e.date} ${e.bodyName}: ${e.title}`, link.meeting(e.slug), e.logline, score(`${e.title} ${e.logline} ${e.date} ${e.bodyName} ${(e.tags || []).join(" ")}`, query)));
    turns.forEach((t) => add(`clip:${t.id}`, `${t.speakerName}, ${t.date} ${t.bodyName} (${t.hms})`, link.speaker(t.speakerSlug), t.text, score(`${t.speakerName} ${t.text}`, query) * 0.8));
    ords.forEach((o) => add(`ordinance:${o.slug}`, o.title, link.ordinance(o.slug), `${o.kind}, ${o.firstDate} → ${o.lastDate}`, score(o.title, query)));
    docs.forEach((d) => add(`document:${d.id}`, `${d.date} ${d.title}`, d.url, `${d.role} · ${d.bodyName} · ${d.episodeTitle || ""}`, score(`${d.title} ${d.episodeTitle || ""}`, query) * 0.7));
    who.forEach((e) => add(`who:${e.slug}`, `${e.name} (${e.category})`, link.view("osint"), e.nexusSummary, score(`${e.name} ${e.nexusSummary || ""} ${(e.keyPeople || []).join(" ")}`, query) * 1.2));
    spk.forEach((s) => add(`speaker:${s.slug}`, `${s.name} — ${s.role}`, link.speaker(s.slug), `${s.turnCount} clips, ${s.meetingCount} meetings`, score(`${s.name} ${s.role}`, query) * 1.5));
    res.sort((a, b) => b.s - a.s);
    return out({ results: res.slice(0, 25).map(({ s, ...r }) => r) });
  });

  server.registerTool("fetch", {
    title: "Open one item",
    description: "Open one item by the id from `search` (meeting:…, clip:…, ordinance:…, document:…, who:…, speaker:…) and get its full details.",
    inputSchema: { id: z.string() }, annotations: READ,
  }, async ({ id }) => {
    const [kind, ...rest] = String(id).split(":");
    const key = rest.join(":");
    const r = kind === "meeting" ? await meetingDetail(key) : kind === "clip" ? await clipDetail(Number(key)) : kind === "ordinance" ? await ordinanceDetail(key)
      : kind === "document" ? await documentDetail(Number(key)) : kind === "who" ? await whoDetail(key) : kind === "speaker" ? await speakerDetail(key) : null;
    if (!r) return fail(`Nothing found for "${id}".`);
    return out({ id, title: r.title || r.name || id, url: r.page || r.url || SITE, text: JSON.stringify(r, null, 1), metadata: { kind } });
  });

  // ======================= MEETINGS =======================
  server.registerTool("search_meetings", {
    title: "Find meetings",
    description: "Find Cheyenne city meetings by words in the title/summary, meeting body, year, date range or tag (e.g. 'Ordinance vote', 'Speaker clips', 'Special meeting', '5+ hours').",
    inputSchema: {
      query: z.string().optional(), body: z.enum(Object.keys(BODIES)).optional().describe("council, special, psc, finance, cow, work, other"),
      year: z.number().int().optional(), from: z.string().optional().describe("YYYY-MM-DD"), to: z.string().optional().describe("YYYY-MM-DD"),
      tag: z.string().optional(), upcomingOnly: z.boolean().optional(), limit: z.number().int().optional(),
    }, annotations: READ,
  }, async (a) => {
    let eps = (await load.episodes()).filter((e) =>
      (!a.body || e.body === a.body) && (!a.year || e.season === a.year) && (!a.from || e.date >= a.from) && (!a.to || e.date <= a.to) &&
      (!a.tag || (e.tags || []).some((t) => t.toLowerCase() === a.tag.toLowerCase())) && (!a.upcomingOnly || e.phase === "upcoming") &&
      matchesAll(`${e.title} ${e.logline} ${e.bodyName} ${e.date} ${(e.tags || []).join(" ")}`, a.query));
    eps.sort((x, y) => (a.query ? score(`${y.title} ${y.logline}`, a.query) - score(`${x.title} ${x.logline}`, a.query) : 0) || y.date.localeCompare(x.date));
    return out({ total: eps.length, meetings: eps.slice(0, lim(a.limit, 15)).map(meetingCard) });
  });

  server.registerTool("get_meeting", {
    title: "Meeting details",
    description: "Everything about one meeting: agenda items, votes, documents (with short text), automatic document checks, and the speaker clips from it. Use the slug from search_meetings (e.g. 2026-11-23-council).",
    inputSchema: { slug: z.string(), maxItems: z.number().int().optional() }, annotations: READ,
  }, async ({ slug, maxItems }) => { const r = await meetingDetail(slug, maxItems); return r ? out(r) : fail(`No meeting "${slug}". Use search_meetings to find the slug.`); });

  server.registerTool("featured_meeting", {
    title: "Featured meeting",
    description: "The meeting featured on the home page, with its plain-English story, key moments, timeline and glossary.",
    inputSchema: {}, annotations: READ,
  }, async () => {
    const f = await load.featured();
    const keep = ["slug", "title", "tagline", "logline", "acts", "scoreboard", "moments", "layman", "glossary", "coxTimeline", "previously", "nextTime"];
    const r = {}; keep.forEach((k) => { if (f[k] != null) r[k] = f[k]; });
    r.page = link.meeting(f.slug);
    for (const k of ["coxTimeline", "glossary", "previously", "nextTime", "scoreboard"]) if (JSON.stringify(r).length > 60000) delete r[k];
    return out(r);
  });

  // ======================= SPEAKER CLIPS =======================
  server.registerTool("search_speaker_clips", {
    title: "Find speaker clips",
    description: "Find video clips of people speaking at meetings: by words said, speaker name, position (Supports/Opposes/…), role they spoke in, year or meeting. Each result has a video link.",
    inputSchema: {
      query: z.string().optional().describe("Words said"), speaker: z.string().optional().describe("Name or part of a name"),
      position: z.enum(STANCES).optional(), speakingAs: z.enum(ROLES).optional(), year: z.number().int().optional(),
      meeting: z.string().optional().describe("Meeting slug"), withVideoOnly: z.boolean().optional(), pointsOfOrderOnly: z.boolean().optional(),
      limit: z.number().int().optional(),
    }, annotations: READ,
  }, async (a) => {
    let t = (await load.turns()).filter((x) =>
      (!a.speaker || matchesAll(x.speakerName, a.speaker)) && (!a.position || x.stanceLabel === a.position) && (!a.speakingAs || x.speakingCapacity === a.speakingAs) &&
      (!a.year || x.season === a.year) && (!a.meeting || x.meetingSlug === a.meeting) && (!a.withVideoOnly || clipVideo(x)) &&
      (!a.pointsOfOrderOnly || x.hasPointOfOrder || x.pointOfOrderType) && matchesAll(x.text, a.query));
    t.sort((x, y) => (a.query ? score(y.text, a.query) - score(x.text, a.query) : 0) || (y.date || "").localeCompare(x.date || "") || (x.startSec - y.startSec));
    return out({ total: t.length, clips: t.slice(0, lim(a.limit, 12)).map((x) => clipSummary(x)) });
  });

  server.registerTool("get_speaker_clip", {
    title: "One speaker clip",
    description: "Full text of one speaker clip with its video link, download link, timing, topics, ordinances and a ready-to-post Facebook caption.",
    inputSchema: { id: z.number().int() }, annotations: READ,
  }, async ({ id }) => { const r = await clipDetail(id); return r ? out(r) : fail(`No clip ${id}.`); });

  server.registerTool("heated_moments", {
    title: "🔥 Heated moments",
    description: "The most contentious clips (same ranking as the site's Heated Moments section): speakers cut off by the chair, points of order, heated exchanges, speaking against an item, strong words. Ranked automatically from the records and transcripts.",
    inputSchema: {
      reason: z.enum(["any", "cut_off", "point_of_order", "heated", "against"]).optional(), year: z.number().int().optional(),
      speaker: z.string().optional(), query: z.string().optional().describe("Words said"), limit: z.number().int().optional(),
    }, annotations: READ,
  }, async (a) => {
    const all = await heated();
    const r = all.filter(({ t }) =>
      (!a.year || t.season === a.year) && (!a.speaker || matchesAll(t.speakerName, a.speaker)) && matchesAll(t.text, a.query) &&
      (!a.reason || a.reason === "any" || (a.reason === "cut_off" && t.pointOfOrderType === "Chair ended the speaker's time") ||
        (a.reason === "point_of_order" && (t.hasPointOfOrder || t.pointOfOrderType)) || (a.reason === "heated" && t.emotion === "angry") || (a.reason === "against" && t.stance === "oppose_challenge")));
    return out({ total: r.length, of: all.length, page: link.view("heated"), note: "Ranked automatically; watch the clip before relying on it.",
      moments: r.slice(0, lim(a.limit, 10)).map((x) => clipSummary(x.t, { rank: x.rank, heatScore: x.heat.score, why: x.heat.why })) });
  });

  // ======================= SPEAKERS / PEOPLE =======================
  server.registerTool("list_speakers", {
    title: "List speakers",
    description: "People who spoke at meetings, with how many clips and meetings each has. Filter by name or role.",
    inputSchema: { query: z.string().optional(), limit: z.number().int().optional() }, annotations: READ,
  }, async ({ query, limit }) => {
    const s = (await load.speakers()).filter((x) => matchesAll(`${x.name} ${x.role}`, query)).sort((a, b) => b.turnCount - a.turnCount);
    return out({ total: s.length, speakers: s.slice(0, lim(limit, 25, 120)).map((x) => ({ slug: x.slug, name: x.name, role: x.role, clips: x.turnCount, meetings: x.meetingCount, first: x.firstDate, last: x.lastDate, page: link.speaker(x.slug) })) });
  });

  server.registerTool("get_speaker", {
    title: "Speaker profile",
    description: "One speaker's profile: roles, topics, what they usually speak for and against, points of order, public profiles, and their most recent and most heated clips.",
    inputSchema: { slug: z.string().describe("Speaker slug or name") }, annotations: READ,
  }, async ({ slug }) => { const r = await speakerDetail(slug); return r ? out(r) : fail(`No speaker "${slug}". Try list_speakers.`); });

  server.registerTool("list_people", {
    title: "People (who was there)",
    description: "Officials and regulars listed on the People page, with the meetings they attended.",
    inputSchema: { query: z.string().optional() }, annotations: READ,
  }, async ({ query }) => {
    const p = (await load.people()).filter((x) => matchesAll(`${x.name} ${x.role}`, query));
    return out(p.map((x) => ({ name: x.name, role: x.role, meetings: (x.meetings || []).length, latest: (x.meetings || []).slice(-3) })));
  });

  // ======================= WHO'S WHO =======================
  server.registerTool("whos_who", {
    title: "Who's Who",
    description: "Business groups, public agencies, contractors, development projects, advocates, officials and residents that come before the city. Filter by words or category.",
    inputSchema: {
      query: z.string().optional(),
      category: z.enum(["Business Groups", "Public Agencies", "Contractors & Engineers", "Development Projects", "Advocates & Watchdogs", "Elected Officials", "City Staff & Boards", "Residents Who Spoke", "Other"]).optional(),
      limit: z.number().int().optional(),
    }, annotations: READ,
  }, async ({ query, category, limit }) => {
    const w = (await load.whosWho()).filter((e) => (!category || e.category === category) && matchesAll(JSON.stringify([e.name, e.subtype, e.nexusSummary, e.keyPeople, e.address]), query));
    return out({ total: w.length, profiles: w.slice(0, lim(limit, 20, 60)).map(whoCard) });
  });

  server.registerTool("get_whos_who_profile", {
    title: "Who's Who profile",
    description: "Full Who's Who profile: key people, address, connections, meetings, agenda items and money involved.",
    inputSchema: { slug: z.string() }, annotations: READ,
  }, async ({ slug }) => { const r = await whoDetail(slug); return r ? out(r) : fail(`No profile "${slug}". Try whos_who.`); });

  // ======================= ORDINANCES =======================
  server.registerTool("search_ordinances", {
    title: "Find ordinances",
    description: "Find ordinances (city laws) followed from 1st reading to final vote, by words, kind or year.",
    inputSchema: { query: z.string().optional(), kind: z.string().optional().describe("e.g. Annexation, Code amendment, Zoning, Budget"), year: z.number().int().optional(), limit: z.number().int().optional() }, annotations: READ,
  }, async ({ query, kind, year, limit }) => {
    const o = (await load.ordinances()).filter((x) => (!kind || norm(x.kind).includes(norm(kind))) && (!year || String(x.firstDate || "").startsWith(String(year)) || String(x.lastDate || "").startsWith(String(year))) && matchesAll(x.title, query))
      .sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
    return out({ total: o.length, ordinances: o.slice(0, lim(limit, 15)).map(ordinanceCard) });
  });

  server.registerTool("get_ordinance", {
    title: "Ordinance history",
    description: "One ordinance from first reading to final vote: every reading, the meetings, what speakers said about it, and its documents.",
    inputSchema: { slug: z.string() }, annotations: READ,
  }, async ({ slug }) => { const r = await ordinanceDetail(slug); return r ? out(r) : fail(`No ordinance "${slug}". Try search_ordinances.`); });

  // ======================= DOCUMENTS =======================
  server.registerTool("search_documents", {
    title: "Find documents",
    description: "Find meeting documents (agendas, minutes, attached documents, substitutes, staff reports) by words in the title, type, year or meeting.",
    inputSchema: {
      query: z.string().optional(), type: z.enum(["agenda", "minutes", "attachment", "substitute", "staff_report"]).optional(),
      year: z.number().int().optional(), meeting: z.string().optional(), searchableTextOnly: z.boolean().optional(), limit: z.number().int().optional(),
    }, annotations: READ,
  }, async (a) => {
    const d = (await load.documents()).filter((x) => (!a.type || x.role === a.type) && (!a.year || x.season === a.year) && (!a.meeting || x.meetingSlug === a.meeting) &&
      (!a.searchableTextOnly || x.ocr) && matchesAll(`${x.title} ${x.episodeTitle || ""} ${x.bodyName}`, a.query))
      .sort((x, y) => (y.date || "").localeCompare(x.date || ""));
    return out({ total: d.length, documents: d.slice(0, lim(a.limit, 15)).map((x) => ({ id: x.id, date: x.date, meeting: x.meetingSlug, body: x.bodyName, type: x.role, title: clip(x.title.replace(/^\[cheyenne-archives-[^\]]+\]\s*/, ""), 200), pages: x.pages, searchableText: x.ocr, url: x.url })) });
  });

  server.registerTool("get_document", {
    title: "Read a document",
    description: "One document's details and text: the short text kept with the meeting, plus the full scanned text when it exists.",
    inputSchema: { id: z.number().int(), maxChars: z.number().int().optional() }, annotations: READ,
  }, async ({ id, maxChars }) => { const r = await documentDetail(id, maxChars); return r ? out(r) : fail(`No document ${id}.`); });

  // ======================= WHERE THE RECORDS COME FROM =======================
  server.registerTool("where_records_come_from", {
    title: "Where the records come from",
    description: "How the records were gathered: the screen-recording films, the chapters, and the list of sources and how each was checked.",
    inputSchema: { includeSourceList: z.boolean().optional() }, annotations: READ,
  }, async ({ includeSourceList }) => {
    const p = await load.provenance();
    return out({ page: link.view("provenance"), summary: p.summaryStats,
      films: (p.masterFilms || []).map((f) => ({ title: f.title, url: goodUrl(f.pagesUrl || f.cdnUrl), description: clip(f.description, 300) })),
      chapters: (p.chapters || []).map((c) => ({ title: c.title, description: clip(c.description, 240), video: goodUrl(c.pagesUrl), sources: includeSourceList ? (c.ledgerRows || []).map((r) => ({ what: r.item || r.key, value: r.value, from: goodUrl(r.origin?.url), how: r.how })) : (c.ledgerRows || []).length })) });
  });

  // ======================= FEEDBACK (developer / beta comments) =======================
  server.registerTool("feedback_summary", {
    title: "Feedback tally",
    description: "Running tally of the notes left on the developer and beta copies: how many are not fixed yet, fixed, confirmed, and how many came from beta testers.",
    inputSchema: {}, annotations: READ,
  }, async () => {
    const c = await load.comments();
    const n = (f) => c.filter(f).length;
    return out({ total: c.length, notFixedYet: n((x) => x.status === "open"), fixedWaitingForOK: n((x) => x.status === "fixed"), confirmed: n((x) => x.status === "confirmed"), wontChange: n((x) => x.status === "wontfix"),
      fromBetaTesters: n((x) => x.site === "beta"), betaTesters: [...new Set(c.filter((x) => x.site === "beta").map((x) => x.author))],
      developerCopy: DEV_SITE, betaCopy: BETA_SITE, file: `https://github.com/${FEEDBACK_REPO}/blob/main/${FEEDBACK_PATH}`, newestOpen: c.filter((x) => x.status === "open").slice(-5).map(commentCard) });
  });

  server.registerTool("list_comments", {
    title: "List feedback comments",
    description: "The notes people left by clicking parts of the developer or beta site: what they clicked, on which page, what they asked for, and whether it's fixed.",
    inputSchema: { status: z.enum(["open", "fixed", "confirmed", "wontfix", "all"]).optional(), from: z.enum(["dev", "beta", "all"]).optional(), query: z.string().optional(), limit: z.number().int().optional() }, annotations: READ,
  }, async ({ status = "open", from = "all", query, limit }) => {
    const c = (await load.comments()).filter((x) => (status === "all" || x.status === status) && (from === "all" || x.site === from) && matchesAll(`${x.comment} ${x.page} ${x.element} ${x.author}`, query));
    return out({ total: c.length, comments: c.slice(-lim(limit, 25, 200)).reverse().map(commentCard) });
  });

  server.registerTool("get_comment", {
    title: "One feedback comment",
    description: "One feedback note by its number, with the exact spot clicked (page, element, CSS selector) and its history.",
    inputSchema: { num: z.number().int() }, annotations: READ,
  }, async ({ num }) => {
    const c = (await load.comments()).find((x) => x.num === num);
    return c ? out({ ...commentCard(c), url: c.url, screen: c.screen, elementText: c.elementText, hash: c.hash }) : fail(`No comment #${num}. New notes get a number within about 5 minutes.`);
  });

  server.registerTool("leave_comment", {
    title: "Leave a feedback note",
    description: "Add a note to the site feedback list, the same as clicking 'Comment on something' on the developer copy. It is filed within about 5 minutes.",
    inputSchema: {
      comment: z.string().min(1).max(2500), page: z.string().optional().describe("Which page/section, e.g. 'Heated Moments'"),
      element: z.string().optional().describe("What part of the page, e.g. 'the #2 clip'"), kind: z.enum(["change", "question", "broken", "other"]).optional(),
      author: z.string().optional(), site: z.enum(["dev", "beta"]).optional(),
    }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (a) => {
    const site = a.site || "dev";
    const payload = { kind: "comment", id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8), site, author: (a.author || (site === "dev" ? "Site owner (via AI assistant)" : "Beta tester (via AI assistant)")).slice(0, 60),
      type: a.kind || "change", comment: a.comment.slice(0, 2500), page: (a.page || "Not specified").slice(0, 200), hash: "", navLabel: "",
      element: (a.element || "Added through the AI assistant").slice(0, 200), elementText: "", tag: "", selector: "", url: site === "dev" ? DEV_SITE : BETA_SITE, screen: "", createdAt: new Date().toISOString() };
    const r = await fetch(`https://ntfy.sh/${NTFY_TOPICS[site]}`, { method: "POST", body: JSON.stringify(payload), headers: { Title: `RWC ${site} comment from ${payload.author}` } });
    if (!r.ok) return fail(`Could not send the note (HTTP ${r.status}). Try again in a minute.`);
    return out({ sent: true, note: "It will appear in the list with a number within about 5 minutes.", id: payload.id });
  });

  server.registerTool("update_comment_status", {
    title: "Mark a comment fixed / reopen it",
    description: "Change a feedback note's status (fixed, confirmed, wontfix, open) and record what was done. Needs the server to have a GitHub token (GITHUB_TOKEN).",
    inputSchema: { num: z.number().int(), status: z.enum(["open", "fixed", "confirmed", "wontfix"]), note: z.string().max(1500).optional().describe("What was done / why") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ num, status, note }) => {
    const tok = process.env.GITHUB_TOKEN;
    if (!tok) return fail("This server has no GitHub token, so it can read comments but not change them. Add GITHUB_TOKEN to the server's settings.");
    const api = `https://api.github.com/repos/${FEEDBACK_REPO}/contents/${FEEDBACK_PATH}`;
    const H = { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "User-Agent": "real-windy-city-mcp" };
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await fetch(api + "?ref=main", { headers: H });
      if (!g.ok) return fail(`Could not read the comments file (HTTP ${g.status}).`);
      const meta = await g.json();
      const list = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
      const c = list.find((x) => x.num === num);
      if (!c) return fail(`No comment #${num}.`);
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      c.status = status; c.updatedAt = now;
      if (note) c.fixNote = note;
      if (status === "fixed" || status === "wontfix") c.fixedAt = now;
      const body = { message: `Feedback #${num}: ${STATUS_L[status]}`, content: Buffer.from(JSON.stringify(list, null, 1) + "\n").toString("base64"), sha: meta.sha, branch: "main" };
      const p = await fetch(api, { method: "PUT", headers: H, body: JSON.stringify(body) });
      if (p.ok) { forgetComments(); return out({ updated: true, comment: commentCard(c), note: "The developer copy shows the new status within about a minute." }); }
      if (p.status !== 409) return fail(`Could not save (HTTP ${p.status}).`);
    }
    return fail("The comments file kept changing while saving. Try again.");
  });

  // ======================= PROMPTS =======================
  server.registerPrompt("meeting_briefing", {
    title: "Brief me on a meeting",
    description: "Plain-English briefing on one meeting: what was decided, who spoke for and against, heated moments, documents to read.",
    argsSchema: { meeting: z.string().describe("Meeting slug or a description like 'latest council meeting'") },
  }, ({ meeting }) => ({ messages: [{ role: "user", content: { type: "text", text: `Using The Real Windy City tools, brief me in plain English on this Cheyenne meeting: ${meeting}. Find it with search_meetings if needed, then use get_meeting. Cover: what was on the agenda, what passed or failed, ordinances and their reading, who spoke for and against (with clip links), any heated moments, and the 3 documents most worth reading. No jargon.` } }] }));
  server.registerPrompt("topic_deep_dive", {
    title: "Everything on a topic",
    description: "Pull together meetings, clips, ordinances, documents and Who's Who for one topic (e.g. data centers, Cox Ranch, annexation).",
    argsSchema: { topic: z.string() },
  }, ({ topic }) => ({ messages: [{ role: "user", content: { type: "text", text: `Research "${topic}" across The Real Windy City: use search, search_meetings, search_speaker_clips, heated_moments, search_ordinances, search_documents and whos_who. Give a dated timeline, the key people and organizations, what residents said, the ordinances involved and where they stand, and links to the best clips and documents. Plain English.` } }] }));
  server.registerPrompt("triage_feedback", {
    title: "Go through the site comments",
    description: "Review all open feedback notes, group them, and suggest what to fix first.",
    argsSchema: {},
  }, () => ({ messages: [{ role: "user", content: { type: "text", text: "Use feedback_summary and list_comments (status open) to go through every open note on The Real Windy City developer and beta copies. Group them (wording, broken things, questions, design), say what each one asks for in one line, flag duplicates, answer any questions you can from the site data, and propose a fix order." } }] }));

  // ======================= RESOURCES =======================
  server.registerResource("overview", "rwc://overview", { title: "The Real Windy City — overview", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# The Real Windy City\nCheyenne, Wyoming city meetings 2008–2026.\n\n- Public site: ${SITE}\n- Developer copy (with comments): ${DEV_SITE}\n- Beta copy: ${BETA_SITE}\n- Facebook: ${FACEBOOK}\n\nSections: Meetings, Speaker Clips, 🔥 Heated Moments, Who's Who, Ordinances, Documents, Where the Records Come From, People.` }],
  }));
  server.registerResource("feedback-list", "rwc://feedback/comments", { title: "Feedback comments (JSON)", mimeType: "application/json" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await load.comments(), null, 1) }],
  }));
}

// ======================= detail builders =======================
const norm = (s) => String(s || "").toLowerCase();

async function meetingDetail(slug, maxItems = 80) {
  const eps = await load.episodes();
  const e = eps.find((x) => x.slug === slug);
  if (!e) return null;
  const shard = (await load.season(e.season).catch(() => ({})))[slug] || {};
  const turns = (await load.turns()).filter((t) => t.meetingSlug === slug).sort((a, b) => a.startSec - b.startSec);
  const items = (shard.items || []).filter((i) => i.kind !== "procedural");
  return {
    ...meetingCard(e),
    agendaItems: items.slice(0, maxItems || 80).map((i) => ({ no: i.itemNo, title: clip(i.title, 300), action: i.action, consent: i.consent || undefined, reading: i.reading || undefined, kind: i.kind, amountUsd: i.amountUsd || undefined, sponsor: i.sponsor || undefined })),
    moreAgendaItems: Math.max(0, items.length - (maxItems || 80)) || undefined,
    votes: shard.votes || undefined,
    documents: (shard.docs || []).slice(0, 40).map((d) => ({ id: d.id, type: d.role, item: d.itemNo, title: clip(d.title, 160), pages: d.pages, url: d.url, text: clip(d.bodySnippet, 300) })),
    automaticChecks: (shard.briefs || []).slice(0, 30).map((b) => ({ item: b.itemNo, title: clip(b.title, 160), flags: (b.flags || []).map((f) => `${f.sev}: ${f.msg}`) })),
    speakerClips: turns.map((t) => clipSummary(t)),
  };
}

async function clipDetail(id) {
  const t = (await load.turns()).find((x) => x.id === id);
  if (!t) return null;
  const a = t.speakerAnalytics || {};
  const h = (await heated()).find((x) => x.t.id === id);
  return {
    ...clipSummary(t), title: `${t.speakerName} at ${t.bodyName}, ${t.date} (${t.hms})`, text: t.text,
    startSec: t.startSec, endSec: t.endSec, start: hms(t.startSec), end: hms(t.endSec),
    download: t.brandedMp4Url || t.directMp4Url || undefined, fullMeetingVideo: t.sourceMeetingMp4Url || undefined,
    representing: t.representingOrg || undefined, topics: t.themes, ordinances: t.ordinances,
    heated: h ? { rank: h.rank, score: h.heat.score, why: h.heat.why } : undefined,
    speakerStats: { clips: a.historicalClipCount, meetings: a.historicalMeetingCount, usuallySpeaks: a.avgSpeakingFormatted, pointsOfOrder: a.pointOfOrderCount, speaksFor: a.lobbiesFor, speaksAgainst: a.opposes },
    facebookCaption: `${t.speakerName} (${t.speakerRole}) at Cheyenne ${t.bodyName}, ${t.date} [${t.hms}]\n\n"${clip(t.text, 280)}"\n\nFollow The Real Windy City on Facebook: ${FACEBOOK}`,
  };
}

async function speakerDetail(slugOrName) {
  const spk = await load.speakers();
  const s = spk.find((x) => x.slug === slugOrName) || spk.find((x) => norm(x.name) === norm(slugOrName)) || spk.find((x) => matchesAll(x.name, slugOrName));
  if (!s) return null;
  const turns = (await load.turns()).filter((t) => t.speakerSlug === s.slug).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const hot = (await heated()).filter((x) => x.t.speakerSlug === s.slug).slice(0, 5);
  const an = s.analytics || {};
  return {
    slug: s.slug, name: s.name, role: s.role, clips: s.turnCount, meetings: s.meetingCount, totalSpeaking: hms(s.totalDurationSec), first: s.firstDate, last: s.lastDate,
    page: link.speaker(s.slug), topics: s.topThemes, speaksFor: an.lobbiesFor, speaksAgainst: an.opposes, pointsOfOrder: an.pointOfOrderCount,
    hasSpokenAs: (an.capacitiesBreakdown || []).map((c) => `${c.capacity}: ${c.count} clips${c.orgs && c.orgs.length ? " (" + c.orgs.join(", ") + ")" : ""}`),
    background: an.osint ? { headline: an.osint.headline, type: an.osint.entityType, affiliations: an.osint.affiliations, publicProfiles: an.osint.profiles || an.osint.verifiedProfiles } : undefined,
    mostHeated: hot.map((x) => clipSummary(x.t, { rank: x.rank, why: x.heat.why })), recentClips: turns.slice(0, 8).map((t) => clipSummary(t)),
  };
}

async function ordinanceDetail(slug) {
  const o = (await load.ordinances()).find((x) => x.slug === slug || x.key === slug);
  if (!o) return null;
  const turns = (await load.turns()).filter((t) => (t.ordinances || []).some((r) => r.slug === o.slug || r === o.slug));
  return { ...ordinanceCard(o), sources: o.sources, readings: (o.readings || []).map((r) => ({ ...r, meetingPage: r.meeting ? link.meeting(r.meeting) : undefined })),
    whatSpeakersSaid: turns.slice(0, 20).map((t) => clipSummary(t)), documents: o.documents || o.docs || undefined };
}

async function documentDetail(id, maxChars = 12000) {
  const d = (await load.documents()).find((x) => x.id === id);
  if (!d) return null;
  const shard = (await load.season(d.season).catch(() => ({})))[d.meetingSlug] || {};
  const full = (shard.docs || []).find((x) => x.id === id) || {};
  let scanned;
  if (d.ocr && d.sha1) {
    try { const o = await load.ocr(d.sha1); const pages = o.pages || o.text || o; const arr = Array.isArray(pages) ? pages : typeof pages === "object" ? Object.keys(pages).sort((a, b) => a - b).map((k) => pages[k]) : [pages]; const txt = arr.map((p, i) => `[page ${i + 1}]\n${(p && p.text) || p}`).join("\n\n"); scanned = txt.length > (maxChars || 12000) ? txt.slice(0, maxChars || 12000) + "\n… (cut short; raise maxChars for more)" : txt; } catch (e) { scanned = undefined; }
  }
  return { id: d.id, title: d.title.replace(/^\[cheyenne-archives-[^\]]+\]\s*/, ""), type: d.role, date: d.date, meeting: d.meetingSlug, meetingTitle: d.episodeTitle, body: d.bodyName,
    pages: d.pages, url: d.url, meetingPage: link.meeting(d.meetingSlug), text: full.bodySnippet || undefined, scannedText: scanned, fingerprint: d.sha1 };
}

async function whoDetail(slug) {
  const w = await load.whosWho();
  const e = w.find((x) => x.slug === slug) || w.find((x) => norm(x.name) === norm(slug)) || w.find((x) => matchesAll(x.name, slug));
  if (!e) return null;
  const r = { ...e, page: link.view("osint") };
  delete r.nexusSummary;
  r.summary = e.nexusSummary;
  return r;
}
