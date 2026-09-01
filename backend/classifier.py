"""Hybrid classification: mentioned_brands / is_branded_query / intent /
topic are pure logic (no LLM call, no Gemini quota spent) — brand_sentiment
and product_tags stay on Gemini Flash because they need actual judgment
(per-brand attribution in comparison answers, negation handling) that a
keyword/regex pass can't reliably do. See docs/ENGINE-COST-CALCULATIONS*.docx
and the project memory this plan came out of for the reasoning."""

import json
import re
from difflib import get_close_matches
from typing import Any, Literal, TypedDict

import httpx

from config import GEMINI_API_KEY, GEMINI_MODEL
from local_sentiment import score_brand_sentiment

_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

INTENTS = ["Commercial", "Informational", "Transactional", "Navigational"]
DOMAIN_TYPES = ["Corporate", "Editorial", "UGC", "Institutional", "Reference", "Other"]

# Stamped onto every answer_brand_mentions row this module scores. Re-running
# the classifier is non-deterministic, so without a version marker a genuine
# sentiment shift is indistinguishable from an edit to the prompt below, and
# rows written by the backfill are indistinguishable from rows written live.
# BUMP THIS whenever the prompt or the sentiment schema changes.
CLASSIFIER_VERSION = "abm-sentiment-v3-local-hf"

# --- Logic-based intent rules -------------------------------------------
# Checked in this order (most specific first) because a query can trip more
# than one bucket — "best phone to buy under 40000" is both Commercial
# ("best") and Transactional ("buy"); Transactional wins since actual
# purchase intent is the stronger, rarer signal worth surfacing precisely.
_TRANSACTIONAL_WORDS = (
    "buy", "price", "cost", "discount", "coupon", "deal", "offer", "order",
    "purchase", "cheap", "cheapest", "sale", "emi", "where to buy",
)
_NAVIGATIONAL_WORDS = ("official site", "official website", "login", "sign in", "download")
_COMMERCIAL_WORDS = (
    "best", "top", "review", " vs ", "versus", "compare", "comparison",
    "alternative", "recommend", "which ", "should i buy", "should i get",
)

_WORD_BOUNDARY = r"(?<!\w){}(?!\w)"


def _logic_mentioned_brands(
    text: str, brand_names: list[str], aliases: dict[str, list[str]] | None = None
) -> list[str]:
    """First-occurrence order, whole-word match — same semantics the old
    Gemini prompt was asked for ('in the order first mentioned').

    `aliases` maps a canonical brand name to its extra candidate strings
    ("Motorola" -> ["Moto", "Lenovo Motorola"]) — every tracked brand has
    always matched only its exact name; this is what makes an alias count
    too. For each brand, every candidate (name + aliases) is searched and the
    EARLIEST match position wins, so "first mentioned" reflects reality even
    when the alias appears before the canonical name does. Within one
    brand's candidates, longest is tried first so a longer alias can't be
    shadowed by a shorter one that happens to be its substring."""
    if not text or not brand_names:
        return []
    aliases = aliases or {}
    hits: list[tuple[int, str]] = []
    for name in brand_names:
        candidates = sorted({name, *(aliases.get(name) or [])} - {""}, key=len, reverse=True)
        best_pos: int | None = None
        for candidate in candidates:
            pattern = _WORD_BOUNDARY.format(re.escape(candidate))
            m = re.search(pattern, text, re.IGNORECASE)
            if m and (best_pos is None or m.start() < best_pos):
                best_pos = m.start()
        if best_pos is not None:
            hits.append((best_pos, name))
    hits.sort(key=lambda h: h[0])
    return [name for _, name in hits]


def _logic_is_branded_query(
    query_text: str, brand_names: list[str], aliases: dict[str, list[str]] | None = None
) -> bool:
    return bool(_logic_mentioned_brands(query_text, brand_names, aliases))


def _logic_intent(query_text: str) -> str:
    q = f" {query_text.lower()} "
    if any(w in q for w in _NAVIGATIONAL_WORDS):
        return "Navigational"
    if any(w in q for w in _TRANSACTIONAL_WORDS):
        return "Transactional"
    if any(w in q for w in _COMMERCIAL_WORDS):
        return "Commercial"
    return "Informational"


def _logic_topic(query_text: str, known_topics: list[str] | None) -> str | None:
    """Fuzzy-matches against the project's existing topic vocabulary so
    near-duplicates ('Hair Oil' / 'Hair oils') collapse to one label, same
    goal the old LLM prompt's enum constraint served. Unlike the LLM
    version this can't invent a genuinely new topic — no known_topics, or
    no close-enough match, means None (uncategorized) rather than a
    fabricated label. That's the one real capability gap versus the old
    Gemini-based classifier; see the project memory for the tradeoff."""
    if not known_topics:
        return None
    # Tight cutoff — this only exists to catch near-identical phrasing of
    # the SAME topic ("Hair Oil" vs "Hair oils"). Looser cutoffs false-match
    # unrelated short strings purely on shared characters (difflib compares
    # whole strings, not words), e.g. "Best phone for BGMI" superficially
    # resembling "Camera Phones" despite being a different topic entirely.
    match = get_close_matches(query_text, known_topics, n=1, cutoff=0.6)
    if match:
        return match[0]
    # Word-overlap fallback, the real workhorse: does every (crudely
    # singularized) word of a known topic label show up in the query? e.g.
    # "What is the best coconut oil for hair growth?" vs topic "Hair
    # Growth" — a whole-string difflib ratio misses this, word sets catch it.
    # Requires ALL of the topic's words present, not just some — topic
    # labels are short (1-3 words) and usually share a generic word with
    # several other topics at once ("Phones" appears in "Foldable Phones",
    # "Camera Phones", "Gaming Phones" alike), so a partial-overlap
    # threshold matches on the generic word alone and picks the wrong one;
    # requiring full containment means only the topic whose DISTINCTIVE
    # word ("Foldable", "Camera", "Gaming") is actually in the query wins.
    def _words(s: str) -> set[str]:
        return {w.rstrip("s") if len(w) > 3 else w for w in re.findall(r"[a-z0-9]+", s.lower())}

    q_words = _words(query_text)
    best, best_len = None, 0
    for topic in known_topics:
        t_words = _words(topic)
        if t_words and t_words <= q_words and len(t_words) > best_len:
            best, best_len = topic, len(t_words)
    return best


class AnswerClassification(TypedDict):
    mentioned_brands: list[str]
    own_brand_sentiment: int | None
    # 0-100 per brand actually named, keyed by the tracked brand's name.
    # Supersedes own_brand_sentiment, which is now just this dict's entry for
    # the own brand and is kept only because raw_responses has a column for it.
    brand_sentiment: dict[str, int]
    topic: str | None
    intent: Literal["Commercial", "Informational", "Transactional", "Navigational"] | None
    is_branded_query: bool
    # `category` (AI-decided aspect label) was tried here and dropped — see
    # supabase/migrations/0008 — in favor of user-managed tags (0009):
    # prompts.category never shipped, product_tags did.
    product_tags: list[str]  # specific models named in the ANSWER — "Edge 70 Fusion", not the brand
    # Brand names the answer discusses that AREN'T in the tracked list — the
    # raw material for auto-suggesting competitors (see store.py's
    # unmatched_brand_mentions write). Only ever populated when the Gemini
    # call actually ran, i.e. only when a TRACKED brand was already detected
    # locally — see this file's module docstring and the project plan for
    # why that's a real, accepted limitation rather than an oversight.
    other_brands_mentioned: list[str]


class QuotaExhaustedError(Exception):
    """Gemini returned 429 RESOURCE_EXHAUSTED.

    Worth its own type because the free tier's binding limit is per DAY
    (currently 20 requests/day/model), not per minute. Retrying inside the
    same run cannot succeed, so a batch job needs to stop immediately rather
    than sleep-and-retry its way through hundreds of doomed calls. The live
    fetch path still wants the old swallow-and-fall-back behaviour, so this is
    only raised when the caller opts in."""


async def _generate_json(
    prompt: str, schema: dict[str, Any], raise_on_quota: bool = False
) -> dict[str, Any] | None:
    if not GEMINI_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _ENDPOINT,
                params={"key": GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": schema,
                    },
                },
            )
        if resp.status_code == 429 and raise_on_quota:
            raise QuotaExhaustedError(resp.text[:300])
        if resp.status_code != 200:
            return None
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError):
        return None


async def classify_answer(
    query_text: str,
    answer_text: str | None,
    brand_names: list[str],
    own_brand_name: str,
    known_topics: list[str] | None = None,
    raise_on_quota: bool = False,
    aliases: dict[str, list[str]] | None = None,
) -> AnswerClassification | None:
    """Fully local classifier (round 4) — zero API calls, zero quota, ever.
    mentioned_brands, is_branded_query, intent, and topic were already local
    (see module docstring); brand_sentiment now is too, via
    local_sentiment.score_brand_sentiment (a general sentiment model run
    per-brand over just the sentence(s) naming that brand — see that
    module's docstring for why per-brand, not per-answer).

    `product_tags`/`other_brands_mentioned` are gone (round 4, explicit
    tradeoff): a general sentiment classifier can't extract product model
    names or spot untracked-brand mentions the way an LLM with real reading
    comprehension could. Kept as empty arrays in the return shape only for
    schema compatibility with existing callers/rows — see
    docs/ENGINE-COST-CALCULATIONS for the note on `other_brands_mentioned`'s
    downstream consumer (competitor auto-suggestion) going stale as a result.

    `known_topics` is the project's existing topic vocabulary — passing it
    lets the fuzzy matcher reuse a label instead of the query going
    uncategorized. Unlike the old LLM-based version this can't invent a
    genuinely new topic label; see _logic_topic's docstring for that
    tradeoff.

    Kept `async def` (no `await` inside it anymore) rather than made sync,
    so every existing call site (tasks.py, one-off backfill scripts) keeps
    working unmodified — changing the signature was assessed and rejected
    as an unnecessary risk for zero benefit here.

    `raise_on_quota` is now a dead parameter (nothing left in this function
    can hit a quota) — kept for signature compatibility with callers that
    still pass it.

    Never returns None anymore — there is no longer a failure mode that
    isn't already handled locally (no answer text, no brand mentioned)."""
    mentioned = _logic_mentioned_brands(answer_text or "", brand_names, aliases)
    is_branded_query = _logic_is_branded_query(query_text, brand_names, aliases)
    intent = _logic_intent(query_text)
    topic = _logic_topic(query_text, known_topics)

    if not answer_text or not answer_text.strip() or not mentioned:
        return {
            "mentioned_brands": mentioned,
            "own_brand_sentiment": None,
            "brand_sentiment": {},
            "topic": topic,
            "intent": intent,
            "is_branded_query": is_branded_query,
            "product_tags": [],
            "other_brands_mentioned": [],
        }

    brand_sentiment = score_brand_sentiment(answer_text, mentioned, aliases)

    return {
        "mentioned_brands": mentioned,
        "own_brand_sentiment": brand_sentiment.get(own_brand_name),
        "brand_sentiment": brand_sentiment,
        "topic": topic,
        "intent": intent,
        "is_branded_query": is_branded_query,
        "product_tags": [],
        "other_brands_mentioned": [],
    }


async def classify_attributes(
    query_text: str, answer_text: str | None, brand_names: list[str]
) -> dict[str, list[str]]:
    """For 'perception'-type prompts (open brand-description questions):
    which attributes/adjectives the AI associates with each brand it
    actually discusses. Returns {brand_name: [attribute, ...]}."""
    if not answer_text or not answer_text.strip():
        return {}

    # Enum-constrained, same fix as classify_answer's mentioned_brands
    # (see that field's comment for the concrete bug this class of fix
    # closes): without it, a near-miss brand string from Gemini is silently
    # dropped by the `if item.get("brand") in brand_names` filter below,
    # which is very likely why brand_attributes has been sitting empty.
    brand_field: dict[str, Any] = {"type": "string"}
    if brand_names:
        brand_field["enum"] = brand_names

    schema = {
        "type": "object",
        "properties": {
            "brand_attributes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "brand": brand_field,
                        "attributes": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["brand", "attributes"],
                },
            }
        },
        "required": ["brand_attributes"],
    }
    prompt = (
        "You are extracting brand-perception attributes from an AI answer engine's response.\n"
        f"Candidate brand names (a subset may appear, or none): {', '.join(brand_names)}\n\n"
        f"Question asked: {query_text!r}\n\n"
        f"AI answer:\n{answer_text[:6000]}\n\n"
        "For each candidate brand actually discussed, list 2-5 short descriptive "
        "attributes/adjectives the answer associates with it (e.g. 'Lightweight', "
        "'Nourishing', 'Premium', 'Affordable'). Only include brands that are "
        "actually discussed in the answer."
    )
    result = await _generate_json(prompt, schema)
    if not result:
        return {}
    return {
        item["brand"]: item.get("attributes", [])
        for item in result.get("brand_attributes", [])
        if item.get("brand") in brand_names
    }


async def generate_content_brief(prompt_text: str, brand_name: str) -> dict[str, Any] | None:
    """Structured writing brief for a prompt/topic the brand wants to close a
    citation gap on: tone, intent, article type, and the prose an editor
    needs before drafting. Used by brief.py's analyse flow."""
    schema = {
        "type": "object",
        "properties": {
            "score": {
                "type": "integer",
                "description": "0-100 confidence this is a strong content opportunity — how directly the topic maps to a citable page, and how open the competitive ground currently is.",
            },
            "tone": {"type": "string", "description": "Short tone-of-voice label, e.g. 'Informative, warm'."},
            "tone_note": {"type": "string", "description": "Short caveat, e.g. 'no hard-sell claims'."},
            "content_intent": {"type": "string", "enum": INTENTS},
            "intent_note": {"type": "string", "description": "Short note on reader stage, e.g. 'comparison-stage reader'."},
            "language": {"type": "string", "description": "e.g. 'English (India)'."},
            "language_note": {"type": "string", "description": "Short note on regional context."},
            "article_type": {"type": "string", "description": "e.g. 'Buying guide', 'Explainer', 'Comparison'."},
            "article_type_note": {"type": "string", "description": "Short note on approximate length, e.g. '1,200-1,500 words'."},
            "main_topic": {
                "type": "string",
                "description": "2-3 sentences describing exactly what the article should cover.",
            },
            "value_proposition": {
                "type": "string",
                "description": "2-3 sentences on what would make this page worth citing over what's currently cited.",
            },
            "target_audience": {
                "type": "string",
                "description": "2-3 sentences describing who this is for and what stage they're at.",
            },
            "key_takeaways": {
                "type": "array",
                "items": {"type": "string"},
                "description": "3-6 concrete, specific writing directives an editor could act on directly — not generic advice.",
            },
        },
        "required": [
            "score", "tone", "content_intent", "language", "article_type",
            "main_topic", "value_proposition", "target_audience", "key_takeaways",
        ],
    }

    prompt = (
        f"You are a content strategist writing a brief for the brand '{brand_name}' to close a "
        f"citation gap with AI answer engines on this prompt/topic: {prompt_text!r}\n\n"
        "Produce a writing brief per the schema: tone of voice with a short caveat, content "
        "intent with a note on reader stage, language/locale with a note on regional context, "
        "article type with a note on approximate length, a main topic description, a value "
        "proposition explaining why this page should be the one engines cite instead of whatever "
        "they cite today, a target audience description, and concrete writing takeaways specific "
        "to this brand and topic — not generic content advice."
    )

    result = await _generate_json(prompt, schema)
    if result is None:
        return None

    intent = result.get("content_intent")
    return {
        "score": result.get("score"),
        "tone": result.get("tone"),
        "tone_note": result.get("tone_note"),
        "content_intent": intent if intent in INTENTS else None,
        "intent_note": result.get("intent_note"),
        "language": result.get("language"),
        "language_note": result.get("language_note"),
        "article_type": result.get("article_type"),
        "article_type_note": result.get("article_type_note"),
        "main_topic": result.get("main_topic"),
        "value_proposition": result.get("value_proposition"),
        "target_audience": result.get("target_audience"),
        "key_takeaways": result.get("key_takeaways") or [],
    }


async def classify_domain_type(domain: str) -> str:
    """Classified once per unique domain and cached in domain_types —
    scales with unique domains (dozens), not with citation volume."""
    schema = {
        "type": "object",
        "properties": {"domain_type": {"type": "string", "enum": DOMAIN_TYPES}},
        "required": ["domain_type"],
    }
    prompt = (
        f"Classify the website '{domain}' into exactly one category: "
        f"{', '.join(DOMAIN_TYPES)}.\n"
        "Corporate = a brand's own commercial site or retailer. Editorial = a "
        "media/publisher/blog. UGC = forums, social media, review sites where "
        "users post content. Institutional = government, medical, academic. "
        "Reference = encyclopedic/reference sites. Other = anything else."
    )
    result = await _generate_json(prompt, schema)
    domain_type = (result or {}).get("domain_type")
    return domain_type if domain_type in DOMAIN_TYPES else "Other"
