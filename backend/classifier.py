"""Cheap structured-output classification, always via Gemini Flash regardless
of which engine produced the answer being classified — keeps this on the
free tier and gives consistent labels across engines."""

import json
from typing import Any, Literal, TypedDict

import httpx

from config import GEMINI_API_KEY, GEMINI_MODEL

_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

INTENTS = ["Commercial", "Informational", "Transactional", "Navigational"]
DOMAIN_TYPES = ["Corporate", "Editorial", "UGC", "Institutional", "Reference", "Other"]


class AnswerClassification(TypedDict):
    mentioned_brands: list[str]
    own_brand_sentiment: int | None
    topic: str | None
    intent: Literal["Commercial", "Informational", "Transactional", "Navigational"] | None
    is_branded_query: bool


async def _generate_json(prompt: str, schema: dict[str, Any]) -> dict[str, Any] | None:
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
        if resp.status_code != 200:
            return None
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError):
        return None


async def classify_answer(
    query_text: str, answer_text: str | None, brand_names: list[str], own_brand_name: str
) -> AnswerClassification | None:
    """One classifier call per raw_response. Detects which tracked brands
    (yours + competitors) are named and in what order, sentiment toward
    YOUR brand specifically, the query's topic/intent, and whether the
    original query itself names a brand.

    Returns None (not a "nothing found" result) when the Gemini call itself
    fails — e.g. rate limited, which is common since this shares Gemini's
    quota with the grounding engine call. Callers must not treat None as
    "brand not mentioned"; text_mentions_brand() is the fallback for that."""
    empty: AnswerClassification = {
        "mentioned_brands": [],
        "own_brand_sentiment": None,
        "topic": None,
        "intent": None,
        "is_branded_query": False,
    }
    if not answer_text or not answer_text.strip():
        return empty

    schema = {
        "type": "object",
        "properties": {
            "mentioned_brands": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Subset of the candidate brand list that is actually named in the answer, in the order first mentioned/recommended.",
            },
            "own_brand_sentiment": {
                "type": "integer",
                "description": f"0-100 sentiment score toward '{own_brand_name}' specifically, only if it is mentioned. Omit/null if not mentioned.",
                "nullable": True,
            },
            "topic": {"type": "string", "description": "Short 1-3 word topic label for this query, e.g. 'Almond Oil'."},
            "intent": {"type": "string", "enum": INTENTS},
            "is_branded_query": {
                "type": "boolean",
                "description": "True if the ORIGINAL QUERY (not the answer) itself names a specific brand.",
            },
        },
        "required": ["mentioned_brands", "topic", "intent", "is_branded_query"],
    }

    prompt = (
        "You are classifying an AI answer engine's response for a brand-visibility "
        "tracking tool. Candidate brand names to look for (a subset may appear, or none):\n"
        f"{', '.join(brand_names)}\n\n"
        f"Original user query: {query_text!r}\n\n"
        f"AI answer text:\n{answer_text[:6000]}\n\n"
        "Classify per the schema."
    )

    result = await _generate_json(prompt, schema)
    if result is None:
        return None

    return {
        "mentioned_brands": result.get("mentioned_brands") or [],
        "own_brand_sentiment": result.get("own_brand_sentiment"),
        "topic": result.get("topic"),
        "intent": result.get("intent") if result.get("intent") in INTENTS else None,
        "is_branded_query": bool(result.get("is_branded_query", False)),
    }


async def classify_attributes(
    query_text: str, answer_text: str | None, brand_names: list[str]
) -> dict[str, list[str]]:
    """For 'perception'-type prompts (open brand-description questions):
    which attributes/adjectives the AI associates with each brand it
    actually discusses. Returns {brand_name: [attribute, ...]}."""
    if not answer_text or not answer_text.strip():
        return {}

    schema = {
        "type": "object",
        "properties": {
            "brand_attributes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "brand": {"type": "string"},
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
