import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groundingVerdict,
  parseEngineDetail,
  resolveRedirectSources,
  sentenceExcerpt,
  stripMarkdown,
} from "./engine-details.ts";

// Shapes below are trimmed copies of REAL rows read out of raw_responses —
// not invented fixtures — so a change in what the engines actually send shows
// up here rather than in production.

const GEMINI_RAW = {
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 200,
    thinkingTokenCount: 50,
    totalTokenCount: 350,
  },
  groundingMetadata: {
    webSearchQueries: ["best camera phone india", "motorola edge 60 pro review"],
    groundingChunks: [
      { web: { uri: "https://www.gsmarena.com/a", title: "gsmarena.com" } },
      { web: { uri: "https://91mobiles.com/b", title: "91mobiles.com" } },
      { web: { uri: "https://smartprix.com/c", title: "smartprix.com" } },
    ],
    groundingSupports: [
      {
        segment: { text: "Motorola offers excellent value.", startIndex: 0, endIndex: 31 },
        groundingChunkIndices: [0, 1],
      },
    ],
  },
};
const GEMINI_ANSWER = "Motorola offers excellent value. Samsung is pricier but polished.";

const OPENAI_RAW = {
  usage: {
    input_tokens: 10,
    output_tokens: 20,
    total_tokens: 30,
    output_tokens_details: { reasoning_tokens: 7 },
  },
  output: [
    { type: "reasoning" },
    { type: "web_search_call", action: { type: "search", query: "q1", queries: ["q1", "q1b"] } },
    { type: "reasoning" },
    { type: "web_search_call", action: { type: "search", query: "q2", queries: ["q2"] } },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "irrelevant",
          annotations: [
            {
              type: "url_citation",
              url: "https://en.wikipedia.org/wiki/X",
              title: "Motorola Edge 60 series",
              start_index: 0,
              end_index: 10,
            },
            // Same URL cited twice — must collapse to one source, two spans.
            {
              type: "url_citation",
              url: "https://en.wikipedia.org/wiki/X",
              title: "Motorola Edge 60 series",
              start_index: 20,
              end_index: 30,
            },
          ],
        },
      ],
    },
  ],
};

test("gemini: sources, mini-searches and grounding supports all parse", () => {
  const d = parseEngineDetail("gemini", GEMINI_RAW, GEMINI_ANSWER);
  assert.equal(d.sources.length, 3);
  assert.deepEqual(
    d.searchRounds.map((r) => r.queries),
    [["best camera phone india", "motorola edge 60 pro review"]],
  );
  assert.equal(d.groundedSpans.length, 1);
  assert.deepEqual(d.groundedSpans[0].sourceNumbers, [1, 2]);
  assert.equal(d.usage?.thinking, 50);
});

test("gemini: a retrieved-but-never-cited source is marked as such", () => {
  const d = parseEngineDetail("gemini", GEMINI_RAW, GEMINI_ANSWER);
  // Chunks 0 and 1 back the one support; chunk 2 was retrieved and never used.
  assert.deepEqual(
    d.sources.map((s) => s.citedInText),
    [true, true, false],
  );
});

test("action.sources adds read-but-uncited pages, marked distinctly", () => {
  const raw = {
    output: [
      {
        type: "web_search_call",
        action: {
          query: "q",
          sources: [
            { url: "https://gsmarena.com/read-only", title: "GSMArena review" },
            "https://plain-string-source.com/x",
          ],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://cited.com/y", start_index: 0, end_index: 4 },
            ],
          },
        ],
      },
    ],
  };
  const d = parseEngineDetail("chatgpt-kie", raw, "0123456789");
  assert.equal(d.sources.length, 3);
  const cited = d.sources.find((s) => s.url === "https://cited.com/y")!;
  const readOnly = d.sources.find((s) => s.url === "https://gsmarena.com/read-only")!;
  const plain = d.sources.find((s) => s.url === "https://plain-string-source.com/x")!;
  assert.equal(cited.citedInText, true);
  assert.equal(readOnly.citedInText, false);
  assert.equal(readOnly.title, "GSMArena review");
  assert.equal(plain.citedInText, false);
  // Requesting the include and getting zero read-only sources back is a real
  // finding (everything read got cited) — must not print the "not requested" note.
  assert.ok(!d.notes.some((n) => n.includes("not requested on this fetch")));
});

test("a page that is BOTH cited and in action.sources counts once, as cited", () => {
  const raw = {
    output: [
      { type: "web_search_call", action: { query: "q", sources: [{ url: "https://both.com/z" }] } },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://both.com/z", start_index: 0, end_index: 4 },
            ],
          },
        ],
      },
    ],
  };
  const d = parseEngineDetail("chatgpt-kie", raw, "0123456789");
  assert.equal(d.sources.length, 1);
  assert.equal(d.sources[0].citedInText, true);
});

test("without the include, the response says why read-only pages are unrecoverable", () => {
  const raw = {
    output: [
      { type: "web_search_call", action: { query: "q", queries: ["q"] } }, // no `sources` key at all
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://cited.com/y", start_index: 0, end_index: 4 },
            ],
          },
        ],
      },
    ],
  };
  const d = parseEngineDetail("chatgpt-kie", raw, "0123456789");
  assert.equal(d.sources.length, 1); // only the cited one
  assert.ok(d.notes.some((n) => n.includes("not requested on this fetch")));
});

test("openai: each web_search_call is its own round, preserving the search loop", () => {
  const d = parseEngineDetail("chatgpt-kie", OPENAI_RAW, "0123456789----------0123456789");
  assert.deepEqual(
    d.searchRounds.map((r) => r.queries),
    [["q1", "q1b"], ["q2"]],
  );
});

test("openai: a URL cited twice is one source with two spans, not two sources", () => {
  const d = parseEngineDetail("chatgpt-kie", OPENAI_RAW, "0123456789----------0123456789");
  assert.equal(d.sources.length, 1);
  assert.equal(d.groundedSpans.length, 2);
  assert.deepEqual(d.groundedSpans[1].sourceNumbers, [1]);
  assert.equal(d.sources[0].title, "Motorola Edge 60 series");
});

test("grounded coverage merges overlapping spans instead of exceeding 100%", () => {
  const raw = {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://a.com/1", start_index: 0, end_index: 8 },
              { type: "url_citation", url: "https://b.com/2", start_index: 4, end_index: 10 },
            ],
          },
        ],
      },
    ],
  };
  // Two overlapping spans covering chars 0-10 of a 10-char answer = 100%,
  // not 140% from naive summing.
  const d = parseEngineDetail("chatgpt-kie", raw, "0123456789");
  assert.equal(d.groundedPct, 100);
});

test("no span data is null coverage, never 0% — absence is not a measurement", () => {
  const raw = { groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.com/1" } }] } };
  const d = parseEngineDetail("gemini", raw, "some answer text");
  assert.equal(d.groundedPct, null);
  assert.ok(d.notes.some((n) => n.includes("grounding supports")));
});

test("kie summary envelope is recognised and explains its own gap", () => {
  const raw = {
    search_queries: ["q"],
    citations: ["livemint.com"],
    usage: { totalTokenCount: 9 },
  };
  const d = parseEngineDetail("gemini-kie", raw, "text");
  assert.equal(d.sources.length, 1);
  assert.equal(d.sources[0].url, "https://livemint.com");
  assert.equal(d.groundedPct, null);
  assert.ok(d.notes.some((n) => n.includes("kie.ai")));
});

test("gemini redirect-proxy sources are swapped for the resolved article URLs", () => {
  const raw = {
    groundingMetadata: {
      groundingChunks: [
        { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA" } },
        { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB" } },
      ],
    },
  };
  const d = resolveRedirectSources(parseEngineDetail("gemini", raw, "text"), [
    "https://www.gsmarena.com/real-article",
    "https://91mobiles.com/other",
  ]);
  assert.deepEqual(
    d.sources.map((s) => s.domain),
    ["gsmarena.com", "91mobiles.com"],
  );
});

test("a real (non-proxy) source URL is never clobbered by the resolver", () => {
  const raw = {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://en.wikipedia.org/wiki/X", start_index: 0, end_index: 4 },
            ],
          },
        ],
      },
    ],
  };
  const d = resolveRedirectSources(parseEngineDetail("chatgpt-kie", raw, "text"), [
    "https://SHOULD-NOT-BE-USED.com/x",
  ]);
  assert.equal(d.sources[0].domain, "en.wikipedia.org");
});

test("a missing raw_response says so rather than rendering an empty card", () => {
  const d = parseEngineDetail("gemini", null, "text");
  assert.deepEqual(d.sources, []);
  assert.ok(d.notes[0].includes("No raw engine response"));
});

test("groundingVerdict: no span data is 'unknown', not a fabricated bucket", () => {
  const v = groundingVerdict({ answerText: "Some real answer text.", groundedSpans: [], groundedPct: null });
  assert.equal(v.verdict, "unknown");
  assert.equal(v.groundedPct, null);
  assert.equal(v.totalSentences, 0);
});

test("groundingVerdict: counts sentences that overlap a grounded span, not characters", () => {
  const text = "Motorola leads on camera. Samsung is pricier. Vivo has a great display.";
  // Span covers only the first sentence.
  const spans = [{ text: "Motorola leads on camera.", startIndex: 0, endIndex: 26, sourceNumbers: [1] }];
  const v = groundingVerdict({ answerText: text, groundedSpans: spans, groundedPct: 33 });
  assert.equal(v.totalSentences, 3);
  assert.equal(v.substantiatedSentences, 1);
  assert.equal(v.verdict, "lightly-grounded");
});

test("groundingVerdict: buckets follow the stated thresholds", () => {
  const text = "x.";
  assert.equal(groundingVerdict({ answerText: text, groundedSpans: [], groundedPct: 85 }).verdict, "well-grounded");
  assert.equal(groundingVerdict({ answerText: text, groundedSpans: [], groundedPct: 60 }).verdict, "moderately-grounded");
  assert.equal(groundingVerdict({ answerText: text, groundedSpans: [], groundedPct: 25 }).verdict, "lightly-grounded");
  assert.equal(groundingVerdict({ answerText: text, groundedSpans: [], groundedPct: 5 }).verdict, "ungrounded");
});

test("stripMarkdown removes bold, links, headers and backticks", () => {
  assert.equal(stripMarkdown("Buy the **iPhone 17 Pro Max**"), "Buy the iPhone 17 Pro Max");
  assert.equal(
    stripMarkdown("See [apple.com](https://www.apple.com/iphone-17-pro/)"),
    "See apple.com",
  );
  assert.equal(stripMarkdown("### Best pick"), "Best pick");
  assert.equal(stripMarkdown("Use the `web_search` tool"), "Use the web_search tool");
  assert.equal(stripMarkdown("- 50MP main\n- 12MP ultrawide"), "50MP main 12MP ultrawide");
});

test("stripMarkdown leaves a bare asterisk (not italic markup) alone", () => {
  // A stray "*" — e.g. a footnote marker — must not vanish just because a
  // naive */* regex would treat it as an unmatched italic delimiter.
  assert.equal(stripMarkdown("Price* varies by region"), "Price* varies by region");
});

test("sentenceExcerpt widens a mid-word span out to real sentence boundaries", () => {
  // The actual broken case from production: a span landing mid-word,
  // rendering as "y for 4Kvideo**, buy the **iPhone Pro" with raw asterisks.
  const text =
    "For anyone shopping for 4K video, buy the iPhone 17 Pro Max. It has the best stabilization.";
  const midWordStart = text.indexOf("shopping") + 3; // lands inside "shopping"
  const midWordEnd = text.indexOf("Max.") - 2; // lands inside "Pro"
  const x = sentenceExcerpt(text, midWordStart, midWordEnd);
  assert.equal(x.text, "For anyone shopping for 4K video, buy the iPhone 17 Pro Max.");
  assert.equal(x.truncatedStart, false);
  assert.equal(x.truncatedEnd, false);
});

test("sentenceExcerpt strips markdown from the widened quote too", () => {
  const text = "Intro sentence here. Buy the **iPhone 17 Pro Max** for [more detail](https://apple.com).";
  const start = text.indexOf("iPhone");
  const end = start + 6;
  const x = sentenceExcerpt(text, start, end);
  assert.equal(x.text, "Buy the iPhone 17 Pro Max for more detail.");
});

test("sentenceExcerpt marks a genuinely truncated edge (run-on sentence beyond maxPad)", () => {
  const filler = "word ".repeat(100); // no punctuation anywhere nearby
  const text = `${filler}TARGET${filler}`;
  const start = text.indexOf("TARGET");
  const x = sentenceExcerpt(text, start, start + 6, 20);
  assert.equal(x.truncatedStart, true);
  assert.equal(x.truncatedEnd, true);
});

test("sentenceExcerpt does not falsely mark a real sentence boundary as truncated", () => {
  const text = "Short one. TARGET sentence here. Another one.";
  const start = text.indexOf("TARGET");
  const x = sentenceExcerpt(text, start, start + 6);
  assert.equal(x.truncatedStart, false);
  assert.equal(x.truncatedEnd, false);
  assert.equal(x.text, "TARGET sentence here.");
});
