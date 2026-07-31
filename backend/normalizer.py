from typing import Any

from brand_check import check_brand_mentions
from classifier import classify_domain_type
from clients.base import Citation
from db import get_supabase
from normalize import classify_content_type


async def enrich_citations(citations: list[Citation]) -> list[dict[str, Any]]:
    """Per-citation enrichment applied before insert: whether the cited page
    itself names the brand (real citations only — checking simulated URLs'
    pages would tell us nothing), plus a free heuristic content-type label."""
    real_urls = [c.url for c in citations if not c.is_simulated]
    mentions_by_url = dict(zip(real_urls, await check_brand_mentions(real_urls)))

    return [
        {
            "url": c.url,
            "domain": c.domain,
            "is_simulated": c.is_simulated,
            "mentions_brand": mentions_by_url.get(c.url),
            "content_type": classify_content_type(c.url),
        }
        for c in citations
    ]


async def ensure_domain_types(domains: set[str]) -> None:
    """Classifies (once) and caches any domain not already in domain_types.
    Scales with unique domains, not citation volume."""
    if not domains:
        return
    sb = get_supabase()
    existing = (
        sb.table("domain_types").select("domain").in_("domain", list(domains)).execute().data
    )
    missing = domains - {row["domain"] for row in existing}
    for domain in missing:
        domain_type = await classify_domain_type(domain)
        try:
            sb.table("domain_types").insert({"domain": domain, "domain_type": domain_type}).execute()
        except Exception:
            pass  # another worker classified it first — fine, it's cached either way
