#!/usr/bin/env python3
"""Save AnyRoR e-Chavdi result pages while you browse, one file per month.

The AnyRoR form is protected by a CAPTCHA. This script does NOT solve or bypass it: it opens a
normal (visible) Chromium window on the AnyRoR rural land record page, you choose
e-CHAVDI, district, taluka, village, year and month, type the CAPTCHA and press
"Get Record Detail" yourself. Whenever the result page (InfoChavdiNoticeView.aspx) is showing,
the script saves its HTML to scripts/raw/. Go back, pick the next month, repeat.
Close the browser window when you are done.

Then build the dashboard dataset:

    npm run data:build

Setup (once, on your own computer):

    pip install playwright
    python -m playwright install chromium

Run:

    python scripts/collect_echavdi.py

Please keep the pace human: one month at a time, as you would in the browser.
"""

from __future__ import annotations

import hashlib
import re
import sys
import time
from collections import Counter
from pathlib import Path

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - setup hint
    sys.exit("Playwright is not installed. Run: pip install playwright && python -m playwright install chromium")

START_URL = "https://anyror.gujarat.gov.in/LandRecordRural.aspx"
RESULT_MARK = "InfoChavdiNoticeView.aspx"
RAW_DIR = Path(__file__).resolve().parent / "raw"

GU_DIGITS = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")


def span_text(html: str, span_id: str) -> str:
    m = re.search(rf'id="ContentPlaceHolder1_{span_id}"[^>]*>([^<]*)<', html)
    return m.group(1).strip() if m else ""


def table_html(html: str) -> str:
    start = html.find('id="ContentPlaceHolder1_gvResult"')
    if start < 0:
        return ""
    end = html.find("</table>", start)
    return html[start:end]


def page_month(table: str) -> str | None:
    """Most common yyyy-mm among the entry dates (dd/mm/yyyy) in the result table."""
    dates = re.findall(r">\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*<", table.translate(GU_DIGITS))
    if not dates:
        return None
    (month, _), = Counter(f"{y}-{int(m):02d}" for _, m, y in dates).most_common(1)
    return month


def slug(*parts: str) -> str:
    # Keep Gujarati letters; file systems handle UTF-8 names. Only strip separators.
    return "-".join(re.sub(r"[\s/\\:*?\"<>|]+", "_", p).strip("_") for p in parts if p)


def save(html: str, seen: set[str]) -> None:
    district, taluka, village = (span_text(html, k) for k in ("lblDistrict", "lblTaluka", "lblVillage"))
    if not village:
        return
    table = table_html(html)
    digest = hashlib.sha1((village + table).encode("utf-8")).hexdigest()
    if digest in seen:
        return  # same result still on screen, e.g. after "View Notice"
    seen.add(digest)

    month = page_month(table)
    if month:
        name = f"{slug(district, taluka, village)}-{month}.html"
    else:
        # A month with no notices: the page itself does not say which month it was.
        name = f"{slug(district, taluka, village)}-EMPTY-{time.strftime('%Y%m%d-%H%M%S')}.html"
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / name).write_text(html, encoding="utf-8")
    rows = table.count("<tr") - 1 if table else 0
    print(f"saved {name} ({max(rows, 0)} entries)")
    if not month:
        print("  -> no entries on this page. Rename it to end in -YYYY-MM.html with the month you chose,")
        print("     so the dashboard knows that month was checked.")


def main() -> None:
    seen: set[str] = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(locale="en-US")
        page = context.new_page()
        page.goto(START_URL)
        print("Browser open. Fill the e-Chavdi form and solve the CAPTCHA yourself; result pages are saved here:")
        print(f"  {RAW_DIR}")
        print("Close the browser window to finish.")
        while browser.is_connected() and context.pages:
            for pg in list(context.pages):
                try:
                    if RESULT_MARK in pg.url:
                        pg.wait_for_load_state("domcontentloaded")
                        save(pg.content(), seen)
                except PlaywrightError:
                    pass  # page navigating or closed
            try:
                context.pages[0].wait_for_timeout(1500)
            except (PlaywrightError, IndexError):
                break
    print("Done. Next: npm run data:build")


if __name__ == "__main__":
    main()
