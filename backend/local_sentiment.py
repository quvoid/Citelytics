"""Free, local, zero-quota sentiment scoring — replaces classify_answer's
Gemini brand_sentiment call entirely (round 4). Scores sentiment per BRAND,
not per answer, by first finding which sentence(s) actually name that brand
(reusing the same word-boundary + alias matching classifier.py's
_logic_mentioned_brands uses) and running a general sentiment model on only
those spans — so a comparison answer ("X is great, Y falls short on
battery") doesn't collapse both brands into one blended score.

Model: cardiffnlp/twitter-roberta-base-sentiment-latest — 3-class
(negative/neutral/positive) RoBERTa, robust on short informal text, which is
exactly what a sentence pulled out of an AI answer looks like. Loaded once,
lazily — importing this module must never itself trigger the ~500MB
download; only the first real call does, after which it's local disk + CPU
inference, no network, ever.
"""
import re
from functools import lru_cache

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_WORD_BOUNDARY = r"(?<!\w){}(?!\w)"

_MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"

# Some CardiffNLP checkpoints expose LABEL_0/1/2 instead of named labels
# depending on the transformers version that read the config — normalize
# both shapes rather than assume one.
_LABEL_MAP = {
    "label_0": "negative", "label_1": "neutral", "label_2": "positive",
    "negative": "negative", "neutral": "neutral", "positive": "positive",
}


@lru_cache(maxsize=1)
def _pipeline():
    from transformers import pipeline

    return pipeline(
        "sentiment-analysis",
        model=_MODEL_NAME,
        tokenizer=_MODEL_NAME,
        top_k=None,  # all 3 class probabilities, not just the argmax
    )


def _candidates(name: str, aliases: dict[str, list[str]] | None) -> list[str]:
    aliases = aliases or {}
    return sorted({name, *(aliases.get(name) or [])} - {""}, key=len, reverse=True)


def _sentences_for_brand(sentences: list[str], candidates: list[str]) -> list[str]:
    if not candidates:
        return []
    alt = "|".join(re.escape(c) for c in candidates)
    pattern = re.compile(_WORD_BOUNDARY.format(f"(?:{alt})"), re.IGNORECASE)
    return [s for s in sentences if pattern.search(s)]


def _score_to_100(probs: dict[str, float]) -> int:
    """0 = strongly negative, 50 = neutral, 100 = strongly positive — the
    same scale classify_answer's old Gemini prompt used, so nothing
    downstream (MetricCellView, finalize.ts, brand_sentiment_score) needs
    to change shape."""
    score = 50 + (probs.get("positive", 0.0) - probs.get("negative", 0.0)) * 50
    return max(0, min(100, round(score)))


def score_brand_sentiment(
    answer_text: str | None,
    mentioned_brands: list[str],
    aliases: dict[str, list[str]] | None = None,
) -> dict[str, int]:
    """One 0-100 score per brand in `mentioned_brands`, scored only from the
    sentence(s) that actually name that brand. A brand with no matching
    sentence (shouldn't happen if mentioned_brands came from the same
    matcher, but defensive) falls back to scoring the whole answer rather
    than being silently dropped from the result."""
    if not answer_text or not mentioned_brands:
        return {}

    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(answer_text) if s.strip()]
    if not sentences:
        sentences = [answer_text]

    # One batched model call across every brand's spans, not N sequential
    # ones — cheap on CPU, but no reason to pay per-brand overhead N times.
    spans_by_brand: dict[str, list[str]] = {}
    all_spans: list[str] = []
    for name in mentioned_brands:
        spans = _sentences_for_brand(sentences, _candidates(name, aliases))
        if not spans:
            spans = [answer_text[:512]]
        spans_by_brand[name] = spans
        all_spans.extend(spans)

    unique_spans = list(dict.fromkeys(all_spans))
    pipe = _pipeline()
    results = pipe(unique_spans, truncation=True, max_length=512)
    probs_by_span = {
        span: {_LABEL_MAP.get(r["label"].lower(), r["label"].lower()): r["score"] for r in result}
        for span, result in zip(unique_spans, results)
    }

    scores: dict[str, int] = {}
    for name, spans in spans_by_brand.items():
        span_scores = [_score_to_100(probs_by_span[s]) for s in spans if s in probs_by_span]
        scores[name] = round(sum(span_scores) / len(span_scores)) if span_scores else 50
    return scores
