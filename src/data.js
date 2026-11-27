// Data access for The Real Windy City MCP server.
// Everything is read from the public site (GitHub Pages) and kept in memory for a while.
export const SITE = process.env.RWC_SITE_URL || "https://therealwindycity.github.io/real-windy-city-tv/";
export const DATA = SITE.replace(/\/?$/, "/") + "data/";
export const DEV_SITE = "https://therealwindycity.github.io/real-windy-city-tv-dev/";
export const BETA_SITE = DEV_SITE + "beta/";
export const FEEDBACK_REPO = "therealwindycity/real-windy-city-tv-dev";
export const FEEDBACK_PATH = "feedback/comments.json";
export const FACEBOOK = "https://www.facebook.com/profile.php?id=61576260305204";
const TTL = Number(process.env.RWC_CACHE_SECONDS || 900) * 1000;

const cache = new Map();
async function getJson(url, ttl = TTL, headers = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    const r = await fetch(url, { headers: { "User-Agent": "real-windy-city-mcp", ...headers } });
    if (!r.ok) throw new Error(`Could not load ${url} (HTTP ${r.status})`);
    return r.json();
  })();
  cache.set(url, { ...(hit || {}), pending });
  try {
    const value = await pending;
    cache.set(url, { value, at: Date.now() });
    return value;
  } catch (e) {
    if (hit && hit.value) { cache.set(url, hit); return hit.value; }
    cache.delete(url);
    throw e;
  }
}

export const load = {
  episodes: () => getJson(DATA + "episodes_index.json"),
  turns: () => getJson(DATA + "speaker_turns.json"),
  speakers: () => getJson(DATA + "speakers_directory.json"),
  whosWho: () => getJson(DATA + "osint_entities.json"),
  ordinances: () => getJson(DATA + "ordinances.json"),
  documents: () => getJson(DATA + "documents_compact.json"),
  provenance: () => getJson(DATA + "provenance_videos.json"),
  people: () => getJson(DATA + "people.json"),
  featured: () => getJson(DATA + "featured.json"),
  season: (year) => getJson(DATA + `seasons/${year}.json`),
  ocr: (sha1) => getJson(`https://raw.githubusercontent.com/therealwindycity/TheReelWindyCity/main/ai-record-ocr/${sha1}.json`, 24 * 3600 * 1000),
  comments: async () => {
    // GitHub API first (no CDN delay), raw file as a fallback
    try {
      return await getJson(`https://api.github.com/repos/${FEEDBACK_REPO}/contents/${FEEDBACK_PATH}?ref=main`, 30 * 1000,
        { Accept: "application/vnd.github.raw+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) });
    } catch (e) {
      return getJson(`https://raw.githubusercontent.com/${FEEDBACK_REPO}/main/${FEEDBACK_PATH}`, 60 * 1000);
    }
  },
};
export function forgetComments() {
  for (const k of cache.keys()) if (k.includes(FEEDBACK_PATH)) cache.delete(k);
}

// ---------- links ----------
export const link = {
  meeting: (slug) => `${SITE}#ep:${encodeURIComponent(slug)}`,
  speaker: (slug) => `${SITE}#speakers:${encodeURIComponent(slug)}`,
  ordinance: (slug) => `${SITE}#ord:${encodeURIComponent(slug)}`,
  view: (v) => `${SITE}#${v}`,
};

// ---------- text helpers ----------
export const norm = (s) => String(s || "").toLowerCase();
export function matchesAll(text, query) {
  if (!query) return true;
  const t = norm(text);
  return norm(query).split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}
export function score(text, query) {
  if (!query) return 0;
  const t = norm(text);
  const q = norm(query).trim();
  let s = t.includes(q) ? 5 : 0;
  for (const w of q.split(/\s+/)) if (w && t.includes(w)) s += 1;
  return s;
}
export const clip = (s, n = 300) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export const hms = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };

// ---------- clips ----------
export function clipVideo(t) {
  const end = t.endSec || (t.startSec || 0) + (t.durationSec || 0);
  return t.brandedMp4Url || t.directMp4Url || (t.sourceMeetingMp4Url ? `${t.sourceMeetingMp4Url}#t=${t.startSec},${end}` : "") || (t.youtubeId ? `https://www.youtube.com/watch?v=${t.youtubeId}&t=${Math.floor(t.startSec || 0)}s` : "");
}
export function clipSummary(t, extra = {}) {
  return {
    id: t.id,
    speaker: t.speakerName,
    speakerSlug: t.speakerSlug,
    role: t.speakerRole,
    speakingAs: t.speakingCapacity,
    position: t.stanceLabel,
    meeting: t.meetingSlug,
    body: t.bodyName,
    date: t.date,
    at: t.hms,
    seconds: Math.round(t.durationSec || 0),
    pointOfOrder: t.pointOfOrderType || (t.hasPointOfOrder ? "Point of order" : undefined),
    speakerConfirmed: t.speakerAttributionVerified === false || t.videoTiming === "diarized_window" ? false : undefined,
    video: clipVideo(t) || undefined,
    readyMadeClip: t.brandedMp4Url ? true : undefined,
    quote: clip(t.text, 220),
    page: link.speaker(t.speakerSlug),
    ...extra,
  };
}

// ---------- heated moments (same ranking as the site's 🔥 Heated Moments section) ----------
const HEAT_WORDS = /\b(point of order|out of order|your time is up|time'?s up|decorum|gavel|recess|shame|lie|lied|liar|lying|corrupt\w*|illegal|unlawful|lawsuits?|fraud\w*|cover[- ]up|disgrace\w*|outrage\w*|insult\w*|disrespect\w*|threat\w*|resign|recall|conflict of interest|violat\w+|backroom|behind closed doors|rigged|ashamed|let me finish|interrupt\w*|null and void|cut my microphone)\b/gi;
export function heatInfo(t) {
  let s = 0;
  const why = [];
  if (t.pointOfOrderType === "Chair ended the speaker's time") { s += 5; why.push("The chair cut the speaker off"); }
  else if (t.hasPointOfOrder || t.pointOfOrderType) { s += 3.5; why.push("A point of order was raised"); }
  if (t.emotion === "angry") { s += 4; why.push("Heated exchange"); }
  else if (t.emotion === "impactful") s += 1.5;
  else if (t.emotion === "concerned") s += 1;
  if (t.stance === "oppose_challenge") { s += 2; why.push("Speaking against the item"); }
  const words = Array.from(new Set(((t.text || "").match(HEAT_WORDS) || []).map((w) => w.toLowerCase())));
  s += Math.min(words.length, 4);
  if ((t.text || "").split(" — ").length >= 5) { s += 1; why.push("Back-and-forth with the council"); }
  if (words.length) why.push("Strong words: " + words.slice(0, 4).map((w) => `"${w}"`).join(", "));
  s += (t.impactScore || 0) / 50;
  return { score: Math.round(s * 10) / 10, why, strongWordsOnly: why.every((w) => w.startsWith("Strong words")) };
}
let heatCache = null;
export async function heated() {
  const turns = await load.turns();
  if (heatCache && heatCache.src === turns) return heatCache.list;
  const playable = (t) => Boolean(t.brandedMp4Url || t.directMp4Url || t.sourceMeetingMp4Url || t.youtubeId);
  const list = turns
    .filter((t) => playable(t) && t.videoTiming !== "removed" && t.videoTiming !== "diarized_window" && t.speakerAttributionVerified !== false && (t.durationSec || 0) >= 15)
    .map((t) => ({ t, heat: heatInfo(t) }))
    .filter((x) => x.heat.score >= 9 && !x.heat.strongWordsOnly)
    .sort((a, b) => b.heat.score - a.heat.score || (b.t.brandedMp4Url ? 1 : 0) - (a.t.brandedMp4Url ? 1 : 0));
  const overlaps = (a, c) => a.t.meetingSlug === c.t.meetingSlug && Math.min(a.t.endSec, c.t.endSec) - Math.max(a.t.startSec, c.t.startSec) > 0.5 * Math.min(a.t.endSec - a.t.startSec, c.t.endSec - c.t.startSec);
  const isChair = (t) => /^(mayor|council president|chair)/i.test(t.speakerRole || "") || /^mayor /i.test(t.speakerName || "");
  const pref = (x) => (x.t.verifiedClip ? 4 : 0) + (x.t.brandedMp4Url ? 2 : 0) + (isChair(x.t) ? 0 : 1);
  const groups = [];
  for (const x of list) {
    const g = groups.find((gg) => gg.members.some((y) => overlaps(y, x)));
    if (!g) groups.push({ best: x, members: [x], top: x.heat });
    else { g.members.push(x); if (pref(x) > pref(g.best)) g.best = x; }
  }
  const out = groups.map((g) => {
    const why = g.top.why.slice();
    g.best.heat.why.forEach((w) => { if (!why.includes(w)) why.push(w); });
    return { t: g.best.t, heat: { score: Math.max(g.top.score, g.best.heat.score), why } };
  }).sort((a, b) => b.heat.score - a.heat.score);
  out.forEach((x, i) => { x.rank = i + 1; });
  heatCache = { src: turns, list: out };
  return out;
}
