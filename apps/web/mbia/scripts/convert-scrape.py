#!/usr/bin/env python3
"""Convert scraped GAA WordPress/Elementor pages to MDX content files.

Reads the raw scrape in .source/scrape/ (gitignored) and writes
content/<section>/<slug>.mdx. Idempotent: re-running overwrites the generated
files. Hand-edited MDX survives as long as its slug is removed from PAGE_MAP.

Usage: python3 scripts/convert-scrape.py  (from apps/web/mbia)
"""

from __future__ import annotations

import re
import sys
from html import unescape as html_unescape
from html.parser import HTMLParser
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
SCRAPE = APP / ".source" / "scrape" / "grenadaairportsauthority.hcprojects.net"
CONTENT = APP / "content"

# old scrape directory -> (section, new slug, title override or None)
PAGE_MAP: dict[str, tuple[str, str, str | None]] = {
    # travel
    "check-in-procedures": ("travel", "check-in-procedures", None),
    "baggage-polices": ("travel", "baggage-policies", "Baggage Policies"),
    "visa-immigration-guidelines": ("travel", "visa-immigration-guidelines", None),
    "customs-duty-free-regulations": ("travel", "customs-duty-free-regulations", None),
    "health-safety-protocols": ("travel", "health-safety-protocols", None),
    "agriculture-control-quarantine": ("travel", "agriculture-control-quarantine", None),
    "flying-with-pets": ("travel", "flying-with-pets", None),
    "faqs": ("travel", "travel-tips-faqs", "Travel Tips & FAQs"),
    "ground-transportation": ("travel", "ground-transportation", None),
    "parking-at-mbia": ("travel", "parking-at-mbia", None),
    "lost-and-found": ("travel", "lost-and-found", None),
    "passenger-information": ("travel", "passenger-information", None),
    "airlines-serving": ("travel", "airlines-serving", "Airlines Serving Grenada"),
    "discover-grenada": ("travel", "discover-grenada", None),
    # at-the-airport
    "airport-lounges": ("at-the-airport", "airport-lounges", None),
    "executive-lounge": ("at-the-airport", "executive-lounge", None),
    "vip-diplomatic-lounge": ("at-the-airport", "vip-diplomatic-lounge", None),
    "iam-jet-centre-lounge": ("at-the-airport", "iam-jet-centre-lounge", None),
    "dine": ("at-the-airport", "dine", None),
    "shopping": ("at-the-airport", "shopping", None),
    "services-amenities": ("at-the-airport", "services-amenities", None),
    "fast-track-meet-greet": ("at-the-airport", "fast-track-meet-greet", None),
    "terminal-map": ("at-the-airport", "terminal-map", None),
    # business
    "aviation-support-services": ("business", "aviation-support-services", None),
    "air-service-development": ("business", "air-service-development", None),
    "air-cargo-services": ("business", "air-cargo-services", None),
    "advertising-promotions": ("business", "advertising-promotions", None),
    "meeting-events-spaces": ("business", "meeting-events-spaces", None),
    # aeronautical-fee, non-aeronautical-fee and schedule-of-services-at-mbia are
    # PDF-embed pages upstream; their MDX is hand-authored (with the PDFs in
    # public/documents/) and must not be regenerated.
    # corporate
    "about-gaa": ("corporate", "about-gaa", "About the Grenada Airports Authority"),
    "company-profile": ("corporate", "company-profile", None),
    "leadership-governance": ("corporate", "leadership-governance", None),
    "board-of-directors": ("corporate", "board-of-directors", None),
    "our-partners": ("corporate", "our-partners", None),
    "careers-opportunities": ("corporate", "careers-opportunities", None),
    "sustainability-community": ("corporate", "sustainability-community", None),
    "community-engagement": ("corporate", "community-engagement", None),
    "accessibility": ("corporate", "accessibility", None),
    "filming-photography": ("corporate", "filming-photography", None),
    "drone-policy": ("corporate", "drone-policy", None),
    "mbia-history": ("corporate", "mbia-history", "MBIA History"),
    "lauriston-airport-history": ("corporate", "lauriston-airport-history", None),
    "pearls-airport-history": ("corporate", "pearls-airport-history", None),
    # development
    "future-plans": ("development", "future-plans", None),
    "ongoing-upcoming-projects": ("development", "ongoing-upcoming-projects", None),
    "recently-completed-projects": ("development", "recently-completed-projects", None),
    "lauriston-airport-development": ("development", "lauriston-airport-development", None),
    # news
    "gaa-unveils-30-year-plan-to-transform-maurice-bishop-international-airport": (
        "news",
        "gaa-unveils-30-year-plan",
        None,
    ),
    "multi-million-dollar-airport-upgrade": ("news", "multi-million-dollar-airport-upgrade", None),
}

# old path segment -> new route, for rewriting internal links
ROUTE_MAP: dict[str, str] = {
    old: f"/{section}/{slug}" for old, (section, slug, _t) in PAGE_MAP.items()
}
ROUTE_MAP.update(
    {
        "mbia": "/airports/mbia",
        "about-mbia": "/airports/mbia",
        "lauriston-airport": "/airports/lauriston",
        "lauriston-general-information": "/airports/lauriston",
        "gaa-contact-us": "/contact",
        "contacts": "/contact",
        "mbia-arrivals": "/flights?board=arrivals",
        "mbia-departure": "/flights?board=departures",
        "lauriston-arrivals": "/flights?airport=CRU&board=arrivals",
        "lauriston-departures": "/flights?airport=CRU&board=departures",
        "jobs": "/corporate/careers-opportunities",
    }
)

SITE_HOSTS = ("grenadaairportsauthority.hcprojects.net", "gaa.gd", "www.gaa.gd")

BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"}
SKIP_TAGS = {"script", "style", "noscript", "form", "svg", "button", "iframe", "select"}


def rewrite_href(href: str) -> str | None:
    """Map an old-site href to a new route; None means drop the link."""
    if href.startswith(("mailto:", "tel:")):
        return href
    m = re.match(r"https?://([^/]+)(/.*)?", href)
    if m:
        if m.group(1) not in SITE_HOSTS:
            return href  # genuinely external
        path = m.group(2) or "/"
    else:
        path = href
    slug = path.strip("/").split("/")[0].split("?")[0].split("#")[0]
    if not slug:
        return "/"
    return ROUTE_MAP.get(slug)


def mdx_escape(text: str) -> str:
    return text.replace("{", "&#123;").replace("}", "&#125;").replace("<", "&lt;")


class ContentExtractor(HTMLParser):
    """Extract the `data-elementor-type="wp-page"` subtree as markdown."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_page = False
        self.page_depth = 0
        self.depth = 0
        self.skip_until: int | None = None
        self.blocks: list[str] = []
        self.current: list[str] = []
        self.block_tag = ""
        self.list_stack: list[str] = []
        self.href: str | None = None
        self.link_text: list[str] = []
        self.in_table = False
        self.table_rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None
        self.bold = 0
        self.italic = 0

    # -- helpers -----------------------------------------------------------
    def flush_block(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.current)).strip()
        self.current = []
        tag = self.block_tag
        self.block_tag = ""
        if not text:
            return
        if tag.startswith("h"):
            level = min(int(tag[1]), 6)
            level = max(level, 2)  # h1 becomes the frontmatter title
            self.blocks.append(f"{'#' * level} {text}")
        elif tag == "li":
            indent = "  " * (len(self.list_stack) - 1 if self.list_stack else 0)
            marker = "1." if (self.list_stack and self.list_stack[-1] == "ol") else "-"
            self.blocks.append(f"{indent}{marker} {text}\x00li")
        else:
            self.blocks.append(text)

    # -- parser hooks ------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        self.depth += 1
        attrs_d = dict(attrs)
        if not self.in_page:
            is_elementor = tag == "div" and attrs_d.get("data-elementor-type") in ("wp-page", "wp-post")
            # Classic (non-Elementor) pages render into the theme's entry-content.
            is_classic = tag == "div" and "entry-content" in attrs_d.get("class", "")
            if is_elementor or is_classic:
                self.in_page = True
                self.page_depth = self.depth
            return
        if self.skip_until is not None:
            return
        if tag in SKIP_TAGS:
            self.skip_until = self.depth
            return
        if tag in ("ul", "ol"):
            self.flush_block()
            self.list_stack.append(tag)
        elif tag == "table":
            self.flush_block()
            self.in_table = True
            self.table_rows = []
        elif self.in_table and tag == "tr":
            self.row = []
        elif self.in_table and tag in ("td", "th"):
            self.cell = []
        elif tag in BLOCK_TAGS:
            self.flush_block()
            self.block_tag = tag
        elif tag == "a":
            self.href = attrs_d.get("href", "")
            self.link_text = []
        elif tag in ("strong", "b"):
            self.bold += 1
        elif tag in ("em", "i"):
            self.italic += 1
        elif tag == "br":
            self.depth -= 1  # void element; handle_startendtag not fired for <br>
            (self.cell if self.cell is not None else self.current).append(" ")
            self.depth += 1

    def handle_endtag(self, tag):
        if self.in_page and self.depth == self.page_depth and tag == "div":
            self.flush_block()
            self.in_page = False
        if self.in_page and self.skip_until is not None and self.depth == self.skip_until:
            self.skip_until = None
        elif self.in_page and self.skip_until is None:
            if tag in ("ul", "ol"):
                self.flush_block()
                if self.list_stack:
                    self.list_stack.pop()
            elif tag == "table":
                self.emit_table()
                self.in_table = False
            elif self.in_table and tag == "tr" and self.row is not None:
                self.table_rows.append(self.row)
                self.row = None
            elif self.in_table and tag in ("td", "th") and self.cell is not None:
                if self.row is not None:
                    self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
                self.cell = None
            elif tag in BLOCK_TAGS:
                self.flush_block()
            elif tag == "a":
                self.finish_link()
            elif tag in ("strong", "b") and self.bold:
                self.bold -= 1
            elif tag in ("em", "i") and self.italic:
                self.italic -= 1
        self.depth -= 1

    def finish_link(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.link_text)).strip()
        self.link_text = []
        target = self.cell if self.cell is not None else self.current
        if not text:
            return
        href = rewrite_href(self.href or "")
        target.append(f"[{text}]({href})" if href else text)
        self.href = None

    def handle_data(self, data):
        if not self.in_page or self.skip_until is not None:
            return
        text = mdx_escape(data)
        if self.bold and text.strip():
            text = f"**{text.strip()}** "
        elif self.italic and text.strip():
            text = f"*{text.strip()}* "
        if self.href is not None:
            self.link_text.append(text)
        elif self.cell is not None:
            self.cell.append(text)
        else:
            self.current.append(text)

    def emit_table(self) -> None:
        rows = [r for r in self.table_rows if any(c for c in r)]
        self.table_rows = []
        if not rows:
            return
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        header, *body = rows
        lines = ["| " + " | ".join(header) + " |", "|" + " --- |" * width]
        lines.extend("| " + " | ".join(r) + " |" for r in body)
        self.blocks.append("\n".join(lines))

    # -- output ------------------------------------------------------------
    def markdown(self) -> str:
        out: list[str] = []
        for block in self.blocks:
            if block.endswith("\x00li"):
                block = block[: -len("\x00li")]
                if out and out[-1].startswith(("-", "1.", " ")):
                    out[-1] = f"{out[-1]}\n{block}"
                    continue
            out.append(block)
        return "\n\n".join(out).strip()


FOOTER_NOISE = re.compile(
    r"^(Newsletter|Subscribe to GAA newsletter.*|Send Message|Subject (One|Two|Three)"
    r"|Blog|Uncategorized|Comments \(\d+\)|.*By hajjieprojects.*)$",
    re.I,
)


def is_noise(block: str) -> bool:
    text = block.strip()
    # List blocks are multi-line; a byline anywhere poisons the whole block.
    if any(FOOTER_NOISE.match(line.lstrip("- ").strip()) for line in text.splitlines()):
        return True
    if text.startswith("data:image"):
        return True  # lazy-load placeholder leaked from the markup
    # Elementor icon-box glyphs ("✈", "📝", "!", "i", …) land as tiny blocks.
    bare = re.sub(r"^#+\s*", "", text)
    return len(bare) <= 3 and not bare.isalpha() or len(bare) <= 1


def extract(path: Path) -> tuple[str, str]:
    """Return (title, markdown body) for a scraped page dir."""
    html = (path / "index.html").read_text(encoding="utf-8", errors="ignore")
    m = (
        re.search(r'property="og:title" content="([^"]+)"', html)
        or re.search(r"<title>([^<]+)", html)
        or re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    )
    if m:
        title = html_unescape(re.sub(r"<[^>]+>", "", m.group(1)))
        title = re.sub(r"\s*[-–—]\s*Grenada Airports? Authority\s*$", "", title).strip()
    else:
        title = path.name.replace("-", " ").title()
    parser = ContentExtractor()
    parser.feed(html)
    blocks = [b for b in parser.markdown().split("\n\n") if not is_noise(b)]
    # Drop a leading heading that duplicates the page title.
    if blocks and re.sub(r"^#+\s*", "", blocks[0]).strip().lower() == title.lower():
        blocks = blocks[1:]
    return title, "\n\n".join(blocks).strip()


MONTHS = {
    m: i + 1
    for i, m in enumerate(
        "January February March April May June July August September October November December".split()
    )
}


def published_date(path: Path) -> str | None:
    html = (path / "index.html").read_text(encoding="utf-8", errors="ignore")
    m = re.search(r'property="article:published_time" content="(\d{4}-\d{2}-\d{2})', html)
    if m:
        return m.group(1)
    m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})", html)
    if m:
        return f"{m.group(3)}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}"
    return None


def dek_from(body: str) -> str:
    for block in body.split("\n\n"):
        text = re.sub(r"[#*\[\]|>-]", "", block).replace("&#123;", "").strip()
        if len(text) > 40 and not text.startswith("!"):
            return (text[:157] + "…") if len(text) > 160 else text
    return "Information from the Grenada Airports Authority."


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> int:
    if not SCRAPE.is_dir():
        print(f"scrape source not found: {SCRAPE}", file=sys.stderr)
        return 1
    written = 0
    for old_dir, (section, slug, title_override) in sorted(PAGE_MAP.items()):
        src = SCRAPE / old_dir
        if not (src / "index.html").is_file():
            print(f"  !! missing scrape page: {old_dir}", file=sys.stderr)
            continue
        title, body = extract(src)
        title = title_override or title
        if not body:
            print(f"  !! empty body: {old_dir}", file=sys.stderr)
            continue
        front = [
            "---",
            f"title: {yaml_quote(title)}",
            f"dek: {yaml_quote(dek_from(body))}",
            f"section: {yaml_quote(section)}",
        ]
        if section == "news":
            front.append(f"publishedAt: {yaml_quote(published_date(src) or '2026-01-01')}")
        front.append("---")
        out = CONTENT / section / f"{slug}.mdx"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(front) + "\n\n" + body + "\n", encoding="utf-8")
        written += 1
    print(f"wrote {written}/{len(PAGE_MAP)} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
