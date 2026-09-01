import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEngineDetail, resolveRedirectSources } from "./engine-details.ts";

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
