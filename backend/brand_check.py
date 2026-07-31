import asyncio

import httpx

from config import BRAND_KEYWORDS

_MAX_CONCURRENT_PAGE_FETCHES = 8
_PAGE_FETCH_TIMEOUT = 8.0
_USER_AGENT = "Mozilla/5.0 (compatible; CitelyticsBot/1.0; +https://example.com/bot)"


def text_mentions_brand(text: str | None) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(kw.lower() in lowered for kw in BRAND_KEYWORDS)


async def _check_one(client: httpx.AsyncClient, semaphore: asyncio.Semaphore, url: str) -> bool | None:
    """Fetches a cited page and checks whether it mentions the brand.
    Returns None (unknown) if the page can't be fetched — e.g. blocked,
    times out, or errors — rather than assuming a false negative."""
    async with semaphore:
        try:
            resp = await client.get(
                url,
                timeout=_PAGE_FETCH_TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": _USER_AGENT},
            )
        except httpx.HTTPError:
            return None
        if resp.status_code >= 400:
            return None
        return text_mentions_brand(resp.text)


async def check_brand_mentions(urls: list[str]) -> list[bool | None]:
    """Checks each URL's page content for a brand mention, in parallel
    with bounded concurrency so we don't hammer target sites."""
    if not urls:
        return []
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT_PAGE_FETCHES)
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(_check_one(client, semaphore, url) for url in urls))
