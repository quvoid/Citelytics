/**
 * Parses the per-answer detail each engine leaves in `raw_responses.raw_response`
 * into ONE shape the UI can render regardless of which engine produced it.
 *
 * Everything here was already being stored and thrown away. Gemini's
 * `groundingSupports` (which sentence each source actually backs) and OpenAI's
 * `annotations[].start_index/end_index` (the same idea, different name) are the
 * two fields that answer "which sites shape what the AI says about my brand",
 * as opposed to "which sites got cited somewhere in this answer" — a question
 * the citations table alone cannot answer.
 *
 * The two engines expose genuinely different amounts of detail, and this
 * module refuses to paper over that: `notes` carries what a given response
 * legitimately cannot tell us, so the UI can say so instead of rendering an
 * empty section that reads like "no data" when it means "not exposed".
 */

export type DetailSource = {
  /** 1-based, matches the †n markers rendered beside the answer. */
  n: number;
  url: string;
  domain: string;
  /** Gemini gives only the domain here; OpenAI gives a real page title. */
  title: string | null;
  /** Backed at least one span of the visible answer, vs. merely retrieved. */
  citedInText: boolean;
};

export type GroundedSpan = {
  text: string;
  startIndex: number;
  endIndex: number;
  /** `n` values from DetailSource — which sources back this span. */
  sourceNumbers: number[];
};

/** One round of the engine's search→read→search loop. Gemini reports a single
 *  flat list; OpenAI reports several rounds, which is itself informative — it
 *  shows the model refining its query after reading. */
export type SearchRound = { round: number; queries: string[] };

export type EngineUsage = {
  input: number | null;
  output: number | null;
  thinking: number | null;
  total: number | null;
};

export type EngineAnswerDetail = {
  engineName: string;
  answerText: string | null;
  sources: DetailSource[];
  searchRounds: SearchRound[];
  groundedSpans: GroundedSpan[];
  /** Share of the answer's characters covered by at least one grounded span.
   *  The uncovered remainder is the model speaking from training memory rather
   *  than from a retrieved source — null when the engine exposes no span data
   *  at all, which is NOT the same as 0%. */
  groundedPct: number | null;
  usage: EngineUsage | null;
  /** Honest limitations for this specific response. Rendered, not swallowed. */
  notes: string[];
};

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const asNum = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pctCovered(spans: GroundedSpan[], answerText: string | null): number | null {
  if (!spans.length || !answerText) return null;
  // Spans can overlap (two sources backing nested claims); merge before
  // measuring or coverage can exceed 100%.
  const ranges = spans
    .map((s) => [s.startIndex, s.endIndex] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  if (!ranges.length) return null;

  let covered = 0;
  let [curStart, curEnd] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      covered += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  covered += curEnd - curStart;
  return Math.max(0, Math.min(100, Math.round((covered / answerText.length) * 100)));
}

/** Gemini: groundingMetadata.{webSearchQueries, groundingChunks, groundingSupports}.
 *  Accepts both the reshaped object this app stores and a raw generateContent
 *  envelope (candidates[0].groundingMetadata), since both exist in the table. */
function parseGemini(raw: Json, answerText: string | null): Partial<EngineAnswerDetail> {
  const gm =
    asObj(raw.groundingMetadata) ??
    asObj(asObj(asArr(raw.candidates)[0])?.groundingMetadata) ??
    {};

  const chunks = asArr(gm.groundingChunks);
  const supports = asArr(gm.groundingSupports);

  // Which chunk indices actually back a span — the retrieved-vs-cited split.
  const citedIdx = new Set<number>();
  for (const s of supports) {
    for (const i of asArr(asObj(s)?.groundingChunkIndices)) {
      if (typeof i === "number") citedIdx.add(i);
    }
  }

  const sources: DetailSource[] = [];
  const nByChunkIndex = new Map<number, number>();
  chunks.forEach((chunk, i) => {
    const web = asObj(asObj(chunk)?.web);
    const url = asStr(web?.uri);
    if (!url) return;
    const n = sources.length + 1;
    nByChunkIndex.set(i, n);
    sources.push({
      n,
      url,
      domain: domainOf(url),
      // Gemini's `web.title` is the DOMAIN, not a page title — surfacing it as
      // a title would be a small lie, so only keep it when it adds something.
      title: null,
      citedInText: citedIdx.has(i),
    });
  });

  const groundedSpans: GroundedSpan[] = supports.flatMap((s) => {
    const o = asObj(s);
    const seg = asObj(o?.segment);
    const text = asStr(seg?.text);
    if (!text) return [];
    const nums = asArr(o?.groundingChunkIndices)
      .map((i) => (typeof i === "number" ? nByChunkIndex.get(i) : undefined))
      .filter((n): n is number => typeof n === "number");
    return [
      {
        text,
        startIndex: asNum(seg?.startIndex) ?? 0,
        endIndex: asNum(seg?.endIndex) ?? text.length,
        sourceNumbers: nums,
      },
    ];
  });

  const queries = asArr(gm.webSearchQueries).filter((q): q is string => typeof q === "string");
  const um = asObj(raw.usageMetadata);

  const notes: string[] = [];
  if (!supports.length && chunks.length) {
    notes.push(
      "This response stores sources but no per-sentence grounding supports, so which claim each source backs isn't recoverable.",
    );
  }

  return {
    sources,
    searchRounds: queries.length ? [{ round: 1, queries }] : [],
    groundedSpans,
    groundedPct: pctCovered(groundedSpans, answerText),
    usage: um
      ? {
          input: asNum(um.promptTokenCount),
          output: asNum(um.candidatesTokenCount),
          thinking: asNum(um.thinkingTokenCount),
          total: asNum(um.totalTokenCount),
        }
      : null,
    notes,
  };
}

/** OpenAI Responses API: output[] carries interleaved reasoning /
 *  web_search_call / message items. Each web_search_call is one round of the
 *  search loop; the final message's url_citation annotations are OpenAI's
 *  equivalent of Gemini's groundingSupports — a character range plus the
 *  source backing it, with a real page title attached. */
function parseOpenAI(raw: Json, answerText: string | null): Partial<EngineAnswerDetail> {
  const output = asArr(raw.output);

  const searchRounds: SearchRound[] = [];
  const sources: DetailSource[] = [];
  const nByUrl = new Map<string, number>();
  const groundedSpans: GroundedSpan[] = [];

  // Present only when the request included
  // `include: ["web_search_call.action.sources"]` — see kie_refetch_20.py.
  // Older stored answers were fetched without it, so this stays false for
  // them and the UI says so instead of implying nothing was ever read.
  let sourcesIncludeRequested = false;
  const readOnlyUrls: { url: string; title: string | null }[] = [];

  for (const item of output) {
    const o = asObj(item);
    if (!o) continue;

    if (o.type === "web_search_call") {
      const action = asObj(o.action);
      const many = asArr(action?.queries).filter((q): q is string => typeof q === "string");
      const one = asStr(action?.query);
      const queries = many.length ? many : one ? [one] : [];
      if (queries.length) searchRounds.push({ round: searchRounds.length + 1, queries });

      if (action && "sources" in action) {
        sourcesIncludeRequested = true;
        for (const s of asArr(action.sources)) {
          const so = asObj(s);
          const url = asStr(so ? so.url : s) ?? (typeof s === "string" ? s : null);
          if (url) readOnlyUrls.push({ url, title: so ? asStr(so.title) : null });
        }
      }
    }

    if (o.type === "message") {
      for (const c of asArr(o.content)) {
        for (const a of asArr(asObj(c)?.annotations)) {
          const ann = asObj(a);
          if (ann?.type !== "url_citation") continue;
          const url = asStr(ann.url) ?? asStr(asObj(ann.url_citation)?.url);
          if (!url) continue;

          let n = nByUrl.get(url);
          if (n === undefined) {
            n = sources.length + 1;
            nByUrl.set(url, n);
            sources.push({
              n,
              url,
              domain: domainOf(url),
              title: asStr(ann.title),
              // An annotation exists only for text the model actually cited,
              // so every source reached this way is cited by construction.
              citedInText: true,
            });
          }

          const start = asNum(ann.start_index);
          const end = asNum(ann.end_index);
          if (start !== null && end !== null && end > start) {
            groundedSpans.push({
              text: answerText ? answerText.slice(start, end) : "",
              startIndex: start,
              endIndex: end,
              sourceNumbers: [n],
            });
          }
        }
      }
    }
  }

  // Any URL the model read but never cited inline. Only reachable when the
  // request set include: ["web_search_call.action.sources"] — checked above,
  // not assumed — and only added if it wasn't already picked up as a cited
  // source (a page can be both read AND cited; that's cited, not read-only).
  for (const { url, title } of readOnlyUrls) {
    if (nByUrl.has(url)) continue;
    const n = sources.length + 1;
    nByUrl.set(url, n);
    sources.push({ n, url, domain: domainOf(url), title, citedInText: false });
  }

  const usage = asObj(raw.usage);
  const notes: string[] = [];
  if (searchRounds.length && !sources.length) {
    notes.push("The model ran searches but cited no source inline for this answer.");
  }
  if (!sourcesIncludeRequested) {
    notes.push(
      "OpenAI can also return every page it READ (not just cited) via the `web_search_call.action.sources` include — not requested on this fetch, so read-but-uncited pages aren't recoverable here.",
    );
  }

  return {
    sources,
    searchRounds,
    groundedSpans,
    groundedPct: pctCovered(groundedSpans, answerText),
    usage: usage
      ? {
          input: asNum(usage.input_tokens),
          output: asNum(usage.output_tokens),
          thinking: asNum(asObj(usage.output_tokens_details)?.reasoning_tokens),
          total: asNum(usage.total_tokens),
        }
      : null,
    notes,
  };
}

/** The kie.ai-proxied Gemini runs stored a hand-built SUMMARY object rather
 *  than the API envelope, so grounding supports were never captured for them.
 *  Recognised explicitly so the UI explains the gap instead of rendering an
 *  empty grounding section. */
function parseKieSummary(raw: Json): Partial<EngineAnswerDetail> {
  const queries = [...asArr(raw.search_queries), ...asArr(raw.web_search_queries)].filter(
    (q): q is string => typeof q === "string",
  );
  const sources: DetailSource[] = asArr(raw.citations)
    .map((c) => asStr(c))
    .filter((u): u is string => Boolean(u))
    .map((u, i) => {
      const url = u.startsWith("http") ? u : `https://${u}`;
      return { n: i + 1, url, domain: domainOf(url), title: null, citedInText: true };
    });

  const usage = asObj(raw.usage);
  return {
    sources,
    searchRounds: queries.length ? [{ round: 1, queries }] : [],
    groundedSpans: [],
    groundedPct: null,
    usage: usage
      ? {
          input: asNum(usage.promptTokenCount) ?? asNum(usage.input_tokens),
          output: asNum(usage.candidatesTokenCount) ?? asNum(usage.output_tokens),
          thinking: asNum(usage.thinkingTokenCount),
          total: asNum(usage.totalTokenCount) ?? asNum(usage.total_tokens),
        }
      : null,
    notes: [
      "Captured through the kie.ai proxy, which stored a summary rather than the full API envelope — per-sentence grounding supports were never available for this run.",
    ],
  };
}

/** Gemini's groundingChunks carry Google's redirect-proxy URI, not the real
 *  article — the client resolves those before writing the `citations` table
 *  but the stored envelope keeps the proxy, so a source list built from
 *  raw_response alone reads "vertexaisearch.cloud.google.com" every row.
 *  Deliberately only overrides a source whose domain IS that proxy, so if the
 *  ordering assumption below ever breaks it degrades to the old behaviour
 *  instead of mislabelling a correct URL. */
const REDIRECT_PROXIES = ["vertexaisearch.cloud.google.com", "grounding-api-redirect"];

export function resolveRedirectSources(
  detail: EngineAnswerDetail,
  /** Resolved citation URLs for this same response, in the engine's own
   *  citation order — gemini_client builds both lists from the same
   *  enumerate() over groundingChunks, so index n lines up with source n. */
  resolvedUrlsInOrder: string[],
): EngineAnswerDetail {
  if (!resolvedUrlsInOrder.length) return detail;
  return {
    ...detail,
    sources: detail.sources.map((s, i) => {
      const isProxy = REDIRECT_PROXIES.some((p) => s.url.includes(p));
      const resolved = resolvedUrlsInOrder[i];
      if (!isProxy || !resolved) return s;
      return { ...s, url: resolved, domain: domainOf(resolved) };
    }),
  };
}

/** Strips the source markdown syntax out of a short quote for display — bold,
 *  links, headers, backticks, list bullets. The full ANSWER text is never run
 *  through this: groundedSpans' startIndex/endIndex are character offsets
 *  into that original text, and stripping syntax would shift every offset
 *  after the first match, breaking every highlight downstream. Safe here
 *  because a Grounding Supports quote is a short, standalone string with
 *  nothing else depending on its exact characters. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/__([^_]+)__/g, "$1") // __bold__ -> bold
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1") // *italic* -> italic
    .replace(/`([^`]+)`/g, "$1") // `code` -> code
    .replace(/^\s{0,3}#{1,6}\s*/gm, "") // # Heading -> Heading
    .replace(/^\s*[-*+]\s+/gm, "") // - bullet -> (removed)
    .replace(/\s+/g, " ")
    .trim();
}

export type SentenceExcerpt = {
  text: string;
  /** True when the excerpt was cut mid-sentence at that edge — the caller
   *  should render an ellipsis there rather than let a fragment read as a
   *  complete, oddly-worded sentence. */
  truncatedStart: boolean;
  truncatedEnd: boolean;
};

/** Is the character at `i` a REAL sentence terminator, as opposed to a period
 *  that just happens to sit inside a URL, domain, abbreviation, or decimal
 *  ("apple.com", "e.g.", "4.5")? `!`/`?`/`\n` are unambiguous; a `.` only
 *  counts when the next character is whitespace or end-of-string — the one
 *  check that told "https://apple.com)." apart: the mid-URL period (followed
 *  by "c") is rejected, the real closing period (followed by nothing) isn't. */
function isSentenceEnd(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === "!" || ch === "?" || ch === "\n") return true;
  if (ch !== ".") return false;
  const next = text[i + 1];
  return next === undefined || /\s/.test(next);
}

/** A groundedSpan's start/endIndex are wherever OpenAI's or Gemini's char
 *  offsets happened to land, which is very often mid-word ("y for 4K
 *  video**, buy the **iPhone Pro" was a real one) — an artifact of how the
 *  span was computed, not a real quote boundary. This widens the window
 *  outward to the nearest sentence-ending punctuation on each side (capped
 *  by `maxPad` so one run-on sentence can't swallow the whole answer),
 *  strips markdown, and reports which edges are still genuinely mid-sentence
 *  so the caller can mark them rather than present a fragment as whole. */
export function sentenceExcerpt(
  fullText: string,
  startIndex: number,
  endIndex: number,
  maxPad = 160,
): SentenceExcerpt {
  const lo = Math.max(0, startIndex - maxPad);
  const hi = Math.min(fullText.length, endIndex + maxPad);

  // Backward scan: find the terminator ending the PRIOR sentence. Recorded
  // as `foundStart` at the moment of the match — truncation is judged from
  // this, not from `start`'s final position, which the whitespace-skip below
  // moves past the terminator itself (checking the character there would
  // just see the space that separated the two sentences).
  let start = lo;
  let foundStart = false;
  for (let i = startIndex; i > lo; i--) {
    if (isSentenceEnd(fullText, i - 1)) {
      start = i;
      foundStart = true;
      break;
    }
  }
  while (start < endIndex && /\s/.test(fullText[start] ?? "")) start++;

  let end = hi;
  let foundEnd = false;
  for (let i = endIndex; i < hi; i++) {
    if (isSentenceEnd(fullText, i)) {
      end = i + 1;
      foundEnd = true;
      break;
    }
  }

  return {
    text: stripMarkdown(fullText.slice(start, end)),
    truncatedStart: start > 0 && !foundStart,
    truncatedEnd: end < fullText.length && !foundEnd,
  };
}

export type GroundingVerdict = {
  /** null exactly when groundedPct is null — no span data at all, not a claim
   *  about the content. */
  groundedPct: number | null;
  /** Sentences in the answer that overlap at least one grounded span, of the
   *  total sentence count — a real, computed analog of "claims substantiated",
   *  not a fabricated ratio. */
  substantiatedSentences: number;
  totalSentences: number;
  verdict:
    | "well-grounded"
    | "moderately-grounded"
    | "lightly-grounded"
    | "ungrounded"
    | "unknown";
};

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

/** One label and one number for the whole answer, from data already parsed —
 *  no new capture, just a summary of groundedSpans against the sentences they
 *  actually cover. Bucket edges chosen to separate "mostly sourced" (80%+)
 *  from "meaningfully unsourced" (under 50%) without pretending finer
 *  precision than a sentence-level count actually supports. */
export function groundingVerdict(
  detail: Pick<EngineAnswerDetail, "answerText" | "groundedSpans" | "groundedPct">,
): GroundingVerdict {
  const { answerText, groundedSpans, groundedPct } = detail;
  if (!answerText || groundedPct === null) {
    return { groundedPct: null, substantiatedSentences: 0, totalSentences: 0, verdict: "unknown" };
  }

  const sentences: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const part of answerText.split(SENTENCE_SPLIT)) {
    const idx = answerText.indexOf(part, cursor);
    if (idx === -1 || !part.trim()) continue;
    sentences.push({ start: idx, end: idx + part.length });
    cursor = idx + part.length;
  }

  const substantiated = sentences.filter((sent) =>
    groundedSpans.some((sp) => sp.startIndex < sent.end && sp.endIndex > sent.start),
  ).length;

  const verdict: GroundingVerdict["verdict"] =
    groundedPct >= 80
      ? "well-grounded"
      : groundedPct >= 50
        ? "moderately-grounded"
        : groundedPct >= 20
          ? "lightly-grounded"
          : "ungrounded";

  return { groundedPct, substantiatedSentences: substantiated, totalSentences: sentences.length, verdict };
}

export function parseEngineDetail(
  engineName: string,
  rawResponse: unknown,
  answerText: string | null,
): EngineAnswerDetail {
  const base: EngineAnswerDetail = {
    engineName,
    answerText,
    sources: [],
    searchRounds: [],
    groundedSpans: [],
    groundedPct: null,
    usage: null,
    notes: [],
  };

  const raw = asObj(rawResponse);
  if (!raw) {
    return { ...base, notes: ["No raw engine response stored for this fetch."] };
  }

  // Dispatch on the SHAPE actually present, not on the engine's name — the
  // same engine has been captured through two different paths in this project
  // (direct API vs. kie.ai proxy) and they store different envelopes.
  let parsed: Partial<EngineAnswerDetail>;
  if (raw.groundingMetadata || asObj(asArr(raw.candidates)[0])?.groundingMetadata) {
    parsed = parseGemini(raw, answerText);
  } else if (Array.isArray(raw.output)) {
    parsed = parseOpenAI(raw, answerText);
  } else {
    parsed = parseKieSummary(raw);
  }

  return { ...base, ...parsed };
}
