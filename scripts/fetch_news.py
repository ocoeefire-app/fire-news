"""Daily fire news fetcher.

Reads every feed in sources.json, cleans and de-duplicates the items,
and writes docs/news.json for the web page to display.
Runs automatically every morning through GitHub Actions.
"""
import html
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "scripts" / "sources.json"
OUT = ROOT / "docs" / "news.json"

MAX_AGE_DAYS = 30        # drop anything older than this
MAX_PER_SOURCE = 25      # keep each source from flooding the page
SUMMARY_CHARS = 220      # short teaser only; full article stays on the source site
# Headlines matching this are dropped (other states' look-alike names, etc.)
EXCLUDE = re.compile(r"Orange County Fire Authority|OCFA|Local 3631|California|Calif\.", re.I)
USER_AGENT = "OcoeeFireNews/1.0 (+https://github.com/ocoeefire-app/fire-news)"


def clean(text: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def teaser(text: str) -> str:
    text = clean(text)
    if len(text) <= SUMMARY_CHARS:
        return text
    cut = text[:SUMMARY_CHARS].rsplit(" ", 1)[0]
    return cut.rstrip(",.;:") + "…"


def entry_time(e):
    for key in ("published_parsed", "updated_parsed"):
        t = e.get(key)
        if t:
            return datetime.fromtimestamp(time.mktime(t), tz=timezone.utc)
    return None


def norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", t.lower())[:80]


def main() -> int:
    sources = json.loads(SOURCES.read_text())
    items, seen_links, seen_titles, status = [], set(), set(), []

    for src in sources:
        try:
            feed = feedparser.parse(src["url"], agent=USER_AGENT)
            entries = feed.entries or []
            if not entries:
                raise ValueError(f"no items (HTTP {feed.get('status', '?')})")
        except Exception as exc:  # one bad feed never stops the rest
            print(f"FAIL  {src['name']}: {exc}")
            status.append({"name": src["name"], "ok": False})
            continue

        kept = 0
        for e in entries:
            if kept >= MAX_PER_SOURCE:
                break
            title = clean(e.get("title", ""))
            link = e.get("link", "")
            if not title or not link or EXCLUDE.search(title):
                continue
            when = entry_time(e)
            limit = datetime.now(timezone.utc) - timedelta(days=src.get("max_age_days", MAX_AGE_DAYS))
            if when and when < limit:
                continue
            now = datetime.now(timezone.utc)
            if when and when > now:  # event listings use the event date; show them as new today
                when = now

            publisher = src["name"]
            if src.get("google"):
                # Google News titles end in " - Publisher"; split it out.
                m = re.match(r"^(.*)\s+-\s+([^-]+)$", title)
                if m:
                    title, publisher = m.group(1).strip(), m.group(2).strip()
                summary = ""  # Google's summaries are just the title again
            else:
                summary = teaser(e.get("summary", ""))

            nt = norm_title(title)
            if link in seen_links or nt in seen_titles:
                continue
            seen_links.add(link)
            seen_titles.add(nt)

            items.append({
                "title": title,
                "link": link,
                "source": publisher,
                "feed": src["name"],
                "category": src["category"],
                "summary": summary,
                "date": when.isoformat() if when else None,
            })
            kept += 1

        print(f"OK    {src['name']}: {kept} items")
        status.append({"name": src["name"], "ok": True, "count": kept})

    if not items:
        print("Every feed failed; keeping yesterday's news.json untouched.")
        return 1
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(),
        "sources": status,
        "items": items,
    }, indent=1))
    print(f"\nWrote {len(items)} items to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
