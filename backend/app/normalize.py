from urllib.parse import urlparse


def extract_domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or url
        return host[4:] if host.startswith("www.") else host
    except ValueError:
        return url
