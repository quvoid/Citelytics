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

  for (const item of output) {
    const o = asObj(item);
    if (!o) continue;

    if (o.type === "web_search_call") {
      const action = asObj(o.action);
      const many = asArr(action?.queries).filter((q): q is string => typeof q === "string");
      const one = asStr(action?.query);
      const queries = many.length ? many : one ? [one] : [];
      if (queries.length) searchRounds.push({ round: searchRounds.length + 1, queries });
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

  const usage = asObj(raw.usage);
  const notes: string[] = [];
  if (searchRounds.length && !sources.length) {
    notes.push("The model ran searches but cited no source inline for this answer.");
  }
  notes.push(
    "OpenAI can also return every page it READ (not just cited) via the `web_search_call.action.sources` include — not requested on this fetch, so read-but-uncited pages aren't recoverable here.",
  );

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
