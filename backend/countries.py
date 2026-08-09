"""The markets a prompt can be targeted at.

One list, used three ways: to validate what the API accepts, to give Gemini a
real country name to reason about (an ISO code in a prompt reads as noise),
and to scope Google Trends lookups in prompt research. The frontend keeps a
matching list in lib/countries.ts — keep the two in sync when adding a market.

Codes are ISO 3166-1 alpha-2, which is what every engine that exposes a
location parameter expects (OpenRouter/OpenAI `user_location.country`,
Perplexity `user_location.country`, SerpApi `gl`).
"""

COUNTRIES: dict[str, str] = {
    "IN": "India",
    "US": "the United States",
    "GB": "the United Kingdom",
    "CA": "Canada",
    "AU": "Australia",
    "NZ": "New Zealand",
    "IE": "Ireland",
    "SG": "Singapore",
    "MY": "Malaysia",
    "ID": "Indonesia",
    "PH": "the Philippines",
    "TH": "Thailand",
    "VN": "Vietnam",
    "JP": "Japan",
    "KR": "South Korea",
    "CN": "China",
    "HK": "Hong Kong",
    "AE": "the United Arab Emirates",
    "SA": "Saudi Arabia",
    "ZA": "South Africa",
    "NG": "Nigeria",
    "KE": "Kenya",
    "DE": "Germany",
    "FR": "France",
    "ES": "Spain",
    "IT": "Italy",
    "NL": "the Netherlands",
    "BE": "Belgium",
    "SE": "Sweden",
    "NO": "Norway",
    "DK": "Denmark",
    "FI": "Finland",
    "PL": "Poland",
    "PT": "Portugal",
    "CH": "Switzerland",
    "AT": "Austria",
    "BR": "Brazil",
    "MX": "Mexico",
    "AR": "Argentina",
    "CL": "Chile",
}


def is_supported(code: str | None) -> bool:
    return bool(code) and code in COUNTRIES


def country_name(code: str) -> str:
    """Display name for prompt-level framing. Falls back to the raw code so an
    unrecognized market degrades to something still usable rather than
    raising inside a Celery task."""
    return COUNTRIES.get(code, code)


def localize_prompt(prompt_text: str, country: str) -> str:
    """Prefixes the market onto the prompt itself.

    Every engine needs this, including the ones that also take a real
    location parameter: those parameters steer the *search*, not the
    *answer*, so without this the model still writes for a generic (usually
    US) reader while citing local sources. Kept here rather than in one
    client so both engines phrase the market identically — otherwise the
    same prompt run against two engines isn't a fair comparison."""
    market = country_name(country)
    return (
        f"Answer as if for a user based in {market}. Prioritize {market}-relevant "
        f"sources, retailers, and local currency/pricing where relevant.\n\n{prompt_text}"
    )
