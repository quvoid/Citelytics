import re
from urllib.parse import urlparse


def extract_domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or url
        return host[4:] if host.startswith("www.") else host
    except ValueError:
        return url


_DISCUSSION_DOMAINS = {"reddit.com", "quora.com"}
_VIDEO_DOMAINS = {"youtube.com", "youtu.be"}

# Ordered heuristic rules — cheapest possible content-type classification,
# no LLM call per citation (that would scale with citation volume, not
# unique-domain count, and get expensive fast).
_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"/(dp|product|products|shop)/", re.I), "Product Page"),
    (re.compile(r"\b(vs|versus)\b", re.I), "Comparison"),
    (re.compile(r"how[-_ ]to", re.I), "How-To Guide"),
    (re.compile(r"\breview", re.I), "Review"),
    (re.compile(r"\b(top|best)[-_ ]?\d+|\d+[-_ ]?(best|top)", re.I), "Listicle"),
    (re.compile(r"/(category|categories|c)/", re.I), "Category Page"),
]


def classify_content_type(url: str) -> str:
    domain = extract_domain(url)
    if domain in _DISCUSSION_DOMAINS:
        return "Discussion"
    if domain in _VIDEO_DOMAINS:
        return "Video"

    path = urlparse(url).path or ""
    for pattern, label in _PATTERNS:
        if pattern.search(path):
            return label
    return "Article" if path.strip("/") else "Other"
