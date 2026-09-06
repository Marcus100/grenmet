"""Bulletins and source-preserving structured text."""

import json
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser


def html_text(raw):
    content = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    pre = re.search(r"<pre\b[^>]*>(.*?)</pre>", content, re.I | re.S)
    parser = BulletinText()
    parser.feed(pre[1] if pre else content)
    return "".join(parser.parts).strip()


def issue_time(text, reference):
    """Resolve WMO day/time using source date, including month rollover."""
    match = re.search(r"\b[A-Z]{4}\d{2}\s+[A-Z]{4}\s+(\d{2})(\d{2})(\d{2})\b", text)
    if not match:
        return None
    reference = datetime.fromisoformat(reference.replace("Z", "+00:00"))
    if reference.tzinfo is None:
        raise ValueError("Reference time must include timezone")
    candidates = []
    for offset in range(-31, 32):
        day = reference + timedelta(days=offset)
        if day.day == int(match[1]):
            candidates.append(
                day.replace(
                    hour=int(match[2]), minute=int(match[3]), second=0, microsecond=0
                )
            )
    if not candidates:
        raise ValueError("Invalid WMO issue date")
    return (
        min(candidates, key=lambda date: abs(date - reference))
        .astimezone(UTC)
        .isoformat()
    )


def sections(text):
    matches = list(re.finditer(r"^\.{3}([^\n]+?)\.{3}\s*$", text, re.M))
    return [
        {
            "heading": match[1],
            "text": text[
                match.end() : matches[i + 1].start()
                if i + 1 < len(matches)
                else len(text)
            ].strip(),
        }
        for i, match in enumerate(matches)
    ]


def zones(text):
    matches = list(re.finditer(r"^(AMZ\d{3})-\d{6}-\s*$", text, re.M))
    return [
        {
            "zone_id": match[1],
            "text": text[
                match.end() : matches[i + 1].start()
                if i + 1 < len(matches)
                else len(text)
            ].strip(),
        }
        for i, match in enumerate(matches)
    ]


def rss_items(raw):
    root = ET.fromstring(raw)
    if root.tag != "rss" or root.find("channel") is None:
        raise ValueError("Expected RSS channel")
    items = []
    for item in root.findall("./channel/item"):
        issued = item.findtext("pubDate")
        date = parsedate_to_datetime(issued) if issued else None
        if date and date.tzinfo is None:
            date = date.replace(tzinfo=UTC)
        description = item.findtext("description", "")
        items.append(
            {
                "title": item.findtext("title"),
                "source_id": item.findtext("guid"),
                "url": item.findtext("link"),
                "issued_at": date.astimezone(UTC).isoformat() if date else None,
                "text": html_text(description),
                "html": description,
                "enclosures": [
                    node.get("url")
                    for node in item.findall("enclosure")
                    if node.get("url")
                ],
            }
        )
    return items


def bulletin(raw, code):
    items = [
        item
        for item in rss_items(raw)
        if not code or re.search(rf"\b{re.escape(code)}\b", item["text"])
    ]
    if not items:
        raise ValueError(f"Missing expected {code} bulletin")
    item = max(items, key=lambda item: item["issued_at"] or "")
    item.pop("html")
    item["sections"] = sections(item["text"])
    item["zones"] = zones(item["text"])
    return item


class BulletinText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"br", "p", "div"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in {"p", "div"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def parse_storms(raw):
    document = json.loads(raw)
    if not isinstance(document, dict) or not isinstance(
        document.get("activeStorms"), list
    ):
        raise ValueError("Missing activeStorms array")
    atlantic = []
    for storm in document["activeStorms"]:
        if not isinstance(storm, dict) or not isinstance(storm.get("id"), str):
            raise ValueError("Storm record requires an id")
        if not re.fullmatch(r"[a-z]{2}\d{6}", storm["id"], re.I):
            raise ValueError("Unexpected storm identifier")
        if storm["id"].lower().startswith("al"):
            atlantic.append(storm)
    return atlantic


def probability(statement):
    match = re.fullmatch(
        r"\*?\s*Formation chance through (48 hours|7 days)\s*\.{3}\s*"
        r"(low|medium|high)\s*\.{3}\s*(near\s+)?(\d{1,3})\s+percent\.?\s*",
        statement,
        re.I,
    )
    if not match or not 0 <= int(match[4]) <= 100:
        raise ValueError("Unrecognized formation probability")
    return match[1].lower(), {
        "statement": statement.strip(),
        "category": match[2].lower(),
        "percent": None if match[3] else int(match[4]),
    }


def parse_outlook(raw):
    root = ET.fromstring(raw)
    candidates = []
    for item in root.findall("./channel/item"):
        parser = BulletinText()
        parser.feed(item.findtext("description", ""))
        bulletin = "".join(parser.parts).strip()
        if not re.search(r"\bTWOAT\b", bulletin):
            continue
        issued = parsedate_to_datetime(item.findtext("pubDate", ""))
        if issued.tzinfo is None:
            raise ValueError("Outlook publication date has no timezone")
        candidates.append((issued, item, bulletin))
    if not candidates:
        raise ValueError("No TWOAT outlook in RSS")
    issued, item, bulletin = max(candidates, key=lambda candidate: candidate[0])
    boundary = re.search(r"For the North Atlantic[^\n]*:\s*\n", bulletin, re.I)
    if not boundary or "$$" not in bulletin[boundary.end() :]:
        raise ValueError("Unrecognized outlook bulletin structure")
    body = bulletin[boundary.end() :].split("$$", 1)[0].strip()
    blocks = re.split(r"\n\s*\n", body)
    blocks = [
        block
        for block in blocks
        if not re.match(
            r"(?:Active Systems:\s*)?(?:NHC|The National Hurricane Center) (?:is issuing|has issued) advisories",
            block,
            re.I,
        )
    ]
    body = "\n\n".join(blocks)
    disturbances = []
    no_development = re.fullmatch(
        r"Tropical cyclone formation is not expected during the next 7 days\.",
        " ".join(body.split()),
        re.I,
    )
    if not no_development:
        for block in blocks:
            if "formation chance" not in block.lower():
                raise ValueError("Unrecognized disturbance block")
            heading = re.match(r"([^:]+):\s*\n", block)
            if not heading:
                raise ValueError("Disturbance heading missing")
            lines = block[heading.end() :].splitlines()
            first = next(
                i for i, line in enumerate(lines) if "formation chance" in line.lower()
            )
            narrative = "\n".join(lines[:first]).strip()
            if not narrative:
                raise ValueError("Disturbance narrative missing")
            probabilities = {}
            for line in lines[first:]:
                period, value = probability(line)
                if period in probabilities:
                    raise ValueError("Duplicate probability period")
                probabilities[period] = value
            if set(probabilities) != {"48 hours", "7 days"}:
                raise ValueError("Both formation periods are required")
            disturbances.append(
                {
                    "index": len(disturbances) + 1,
                    "heading": " ".join(heading[1].split()) + ":",
                    "narrative": narrative,
                    "probabilities": probabilities,
                }
            )
        if not disturbances:
            raise ValueError("Outlook does not explicitly establish no development")
    return {
        "title": item.findtext("title"),
        "source_id": item.findtext("guid"),
        "url": item.findtext("link"),
        "issued_at": issued.astimezone(UTC).isoformat(),
        "text": bulletin,
        "disturbances": disturbances,
    }
