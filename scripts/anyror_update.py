#!/usr/bin/env python3
"""One command to bring the dashboard up to date from AnyRoR. You only type the CAPTCHAs.

    python scripts/anyror_update.py              # e-Chavdi months that are missing + this month, then 7/12 of your land
    python scripts/anyror_update.py --chavdi     # e-Chavdi only
    python scripts/anyror_update.py --712        # 7/12 (VF-7) of your survey numbers only
    python scripts/anyror_update.py --months 2026-09,2026-10
    python scripts/anyror_update.py --manual     # fill the forms yourself; pages are still saved

What it does, in a normal (visible) browser window:
  1. For each month to fetch, opens the AnyRoR rural form and picks e-CHAVDI, district, taluka,
     village, year and month for you. You type the CAPTCHA and press "Get Record Detail".
     The result page is saved to scripts/raw/ (public notice lists, committed).
  2. For each of your survey numbers, picks VF-7 and the survey number. You type the CAPTCHA.
     The 7/12 page is saved to scripts/private/712/ (never committed: it has owner names) and
     compared with the previous copy, so you see what changed.
  3. Rebuilds src/data/land/echavdi.json and, if you say yes, commits and pushes it so the live
     site updates (GitHub deploys main automatically).

The CAPTCHA is never read, solved or skipped: AnyRoR uses it to keep automated tools out, and this
tool respects that. If a drop-down cannot be found (AnyRoR changes its form now and then), the
script tells you which one to pick by hand and carries on.

Your survey numbers are read from scripts/private/my-land.txt (asked once, never committed).

Setup (once, on your own computer):

    pip install playwright
    python -m playwright install chromium
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import html as htmllib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import Page, sync_playwright
except ImportError:  # pragma: no cover - setup hint
    sys.exit("Playwright is not installed. Run: pip install playwright && python -m playwright install chromium")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_echavdi import RAW_DIR, RESULT_MARK, START_URL, page_month, slug, span_text, table_html  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = Path(__file__).resolve().parent / "private"
MY_LAND = PRIVATE / "my-land.txt"
SEVEN_TWELVE = PRIVATE / "712"
ECHAVDI_JSON = ROOT / "src" / "data" / "land" / "echavdi.json"
VILLAGES_TS = ROOT / "src" / "data" / "land" / "villages.ts"

GU_DIGITS = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")
GU_MONTHS = ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ", "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"]
EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

# Gujarati text on Windows terminals.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


def village_names() -> tuple[str, str, str]:
    """District, taluka and village (Gujarati, as AnyRoR prints them) of the first configured village."""
    text = VILLAGES_TS.read_text(encoding="utf-8")
    get = lambda key: re.search(rf"^\s*{key}: '([^']+)'", text, re.M)  # noqa: E731
    found = [get(k) for k in ("district", "taluka", "village")]
    if not all(found):
        sys.exit(f"Could not read district/taluka/village from {VILLAGES_TS}")
    return tuple(m.group(1) for m in found)  # type: ignore[return-value]


def norm_survey(s: str) -> str:
    return re.sub(r"\s+", "", s.translate(GU_DIGITS).lower()).replace("પૈકી", "p")


def my_land() -> list[str]:
    if MY_LAND.exists():
        items = [norm_survey(x) for x in re.split(r"[,;\s]+", MY_LAND.read_text(encoding="utf-8")) if x.strip()]
        if items:
            return list(dict.fromkeys(items))
    print("Which survey numbers are yours? (as AnyRoR writes them, separated by commas, e.g. 58, 118/2, 260/1/p1)")
    print("They are saved only in scripts/private/my-land.txt on this computer.")
    answer = input("> ").strip()
    items = [norm_survey(x) for x in re.split(r"[,;\s]+", answer) if x.strip()]
    PRIVATE.mkdir(parents=True, exist_ok=True)
    MY_LAND.write_text(", ".join(items) + "\n", encoding="utf-8")
    return items


def months_to_fetch(district: str, taluka: str, village: str, today: dt.date, include_current: bool) -> list[str]:
    """Months missing from echavdi.json within the last 24, plus (optionally) the current month."""
    have: set[str] = set()
    if ECHAVDI_JSON.exists():
        for d in json.loads(ECHAVDI_JSON.read_text(encoding="utf-8")):
            if (d.get("district"), d.get("taluka"), d.get("village")) == (district, taluka, village):
                have.update(d.get("months", []))
    out = []
    y, m = today.year, today.month
    for _ in range(24):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        key = f"{y}-{m:02d}"
        if key not in have:
            out.append(key)
    out.reverse()
    if include_current:
        out.append(f"{today.year}-{today.month:02d}")  # notices so far this month; refreshed next run
    return out


# ---------------------------------------------------------------------------
# Form filling (by visible option text, so internal field names do not matter)
# ---------------------------------------------------------------------------

FIND_OPTION_JS = """
([wanted, exact]) => {
  const digits = '૦૧૨૩૪૫૬૭૮૯';
  const norm = (s) => s.replace(/[૦-૯]/g, (d) => digits.indexOf(d)).replace(/પૈકી/g, 'p').replace(/\\s+/g, ' ').trim().toLowerCase();
  const tight = (s) => norm(s).replace(/\\s+/g, '');
  const want = wanted.map(exact ? tight : norm);
  const selects = [...document.querySelectorAll('select')];
  for (let i = 0; i < selects.length; i++) {
    const sel = selects[i];
    if (sel.disabled) continue;
    const box = sel.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    for (const o of sel.options) {
      const t = exact ? tight(o.text) : norm(o.text);
      if (want.some((w) => (exact ? t === w : t.includes(w)))) {
        return { index: i, value: o.value, text: o.text.trim(), already: sel.value === o.value };
      }
    }
  }
  return null;
}
"""


def choose(page: Page, label: str, wanted: list[str], exact: bool = False, timeout_s: float = 20) -> bool:
    """Select the first visible option matching `wanted` in any drop-down. Waits for AJAX/postbacks."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            hit = page.evaluate(FIND_OPTION_JS, [wanted, exact])
        except PlaywrightError:
            hit = None  # page is reloading after the previous choice
        if hit:
            if not hit["already"]:
                page.locator("select").nth(hit["index"]).select_option(value=hit["value"])
                settle(page)
            print(f"   {label}: {hit['text']}")
            return True
        page.wait_for_timeout(500)
    print(f"   {label}: not found. Please pick {wanted[0]!r} yourself in the browser.")
    return False


def settle(page: Page) -> None:
    """Give an ASP.NET postback (full reload or UpdatePanel) time to finish."""
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PlaywrightError:
        pass
    page.wait_for_timeout(600)


def focus_captcha(page: Page) -> None:
    sel = "input[id*='aptcha' i], input[name*='aptcha' i], input[placeholder*='aptcha' i], input[placeholder*='કેપ્ચા']"
    try:
        box = page.locator(sel).first
        if box.count():
            box.scroll_into_view_if_needed(timeout=3000)
            box.focus()
    except PlaywrightError:
        pass
    try:
        page.bring_to_front()
    except PlaywrightError:
        pass


def open_form(page: Page) -> None:
    page.goto(START_URL, wait_until="domcontentloaded")
    settle(page)


def fill_common(page: Page, kind: list[str], district: str, taluka: str, village: str) -> None:
    choose(page, "Record", kind)
    choose(page, "District", [district])
    choose(page, "Taluka", [taluka])
    choose(page, "Village", [village])


def month_labels(ym: str) -> tuple[list[str], list[str]]:
    y, m = ym.split("-")
    mi = int(m)
    years = [y]
    months = [str(mi), f"{mi:02d}", GU_MONTHS[mi - 1], EN_MONTHS[mi - 1], EN_MONTHS[mi - 1][:3]]
    return years, months


# ---------------------------------------------------------------------------
# Waiting for results
# ---------------------------------------------------------------------------


def wait_for_chavdi(context, timeout_s: float = 600) -> str | None:
    """HTML of the e-Chavdi result page once it shows (any tab), or None on timeout/close.

    Before each month the form tab is reloaded and other tabs are closed, so any result page
    that appears now is the new one (two empty months look identical, so no de-duplication)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for pg in list(context.pages):
            try:
                if RESULT_MARK in pg.url:
                    pg.wait_for_load_state("domcontentloaded")
                    html = pg.content()
                    if span_text(html, "lblVillage"):
                        return html
            except PlaywrightError:
                pass
        if not context.pages:
            return None
        try:
            context.pages[0].wait_for_timeout(800)
        except PlaywrightError:
            return None
    return None


def wait_for_enter(prompt: str) -> str:
    try:
        return input(prompt).strip().lower()
    except EOFError:
        return "q"


# ---------------------------------------------------------------------------
# 7/12 snapshots
# ---------------------------------------------------------------------------


def visible_text(html: str) -> list[str]:
    """Readable lines of a page: tags, scripts and ASP.NET state removed, cells kept on one line each."""
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r'(?is)<input[^>]*type="hidden"[^>]*>', " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d|table)>", "\n", html)
    html = re.sub(r"(?i)</t[dh]>", " | ", html)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", html))
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[ \t ]+", " ", line).strip(" |")
        if line:
            lines.append(line)
    return lines


def stable_lines(lines: list[str], *days: dt.date) -> list[str]:
    """Drop lines that change on every visit (the viewing date/time, CAPTCHA), so diffs show real changes."""
    stamps = {d.strftime(f) for d in days for f in ("%d/%m/%Y", "%d-%m-%Y")}
    out = []
    for line in lines:
        ascii_line = line.translate(GU_DIGITS)
        if any(s in ascii_line for s in stamps) or re.search(r"(?i)captcha|કેપ્ચા|\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?", ascii_line):
            continue
        out.append(line)
    return out


def save_712(survey: str, html: str, today: dt.date) -> None:
    folder = SEVEN_TWELVE / slug(survey)
    folder.mkdir(parents=True, exist_ok=True)
    previous = sorted(folder.glob("*.html"))
    path = folder / f"{today.isoformat()}.html"
    path.write_text(html, encoding="utf-8")
    print(f"   saved 7/12 for {survey}: {path.relative_to(ROOT)}")
    if not previous or previous[-1] == path:
        if len(previous) <= 1:
            print("   first copy: next run will show what changed.")
        return
    try:
        then = dt.date.fromisoformat(previous[-1].stem)
    except ValueError:
        then = today
    before = stable_lines(visible_text(previous[-1].read_text(encoding="utf-8")), today, then)
    after = stable_lines(visible_text(html), today, then)
    diff = [d for d in difflib.unified_diff(before, after, lineterm="", n=0) if d[:1] in "+-" and not d.startswith(("+++", "---"))]
    if not diff:
        print(f"   no change since {previous[-1].stem}.")
        return
    print(f"   CHANGED since {previous[-1].stem}:")
    for d in diff[:40]:
        print(f"     {d}")
    if len(diff) > 40:
        print(f"     … {len(diff) - 40} more lines; compare the two files in scripts/private/712/{slug(survey)}/")


def page_html_for_712(context, form_page: Page) -> tuple[str | None, bool]:
    """The 7/12 page (a new tab if one opened, otherwise the form tab) and whether it still looks like the search form."""
    pages = [p for p in context.pages if not p.is_closed()]
    candidates = [p for p in pages if p is not form_page] or [form_page]
    try:
        pg = candidates[-1]
        pg.wait_for_load_state("domcontentloaded")
        still_form = "LandRecordRural.aspx" in pg.url and pg.locator("input[id*='aptcha' i], input[name*='aptcha' i]").count() > 0
        return pg.content(), still_form
    except PlaywrightError:
        return None, False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run_chavdi(context, page: Page, months: list[str], names: tuple[str, str, str], manual: bool) -> int:
    district, taluka, village = names
    saved = 0
    for ym in months:
        print(f"\ne-Chavdi {ym}")
        open_form(page)
        if not manual:
            fill_common(page, ["e-chavdi", "ઈ-ચાવડી", "ચાવડી", "chavdi"], district, taluka, village)
            years, mons = month_labels(ym)
            choose(page, "Year", years, exact=True)
            choose(page, "Month", mons, exact=True)
        else:
            print("   Fill the e-CHAVDI form for this month yourself.")
        focus_captcha(page)
        print("   Type the CAPTCHA in the browser and press the button. Waiting for the result…")
        html = wait_for_chavdi(context)
        if html is None:
            print("   No result page (timed out or browser closed). Skipping.")
            if not context.pages:
                break
            continue
        table = table_html(html)
        month = page_month(table) or ym
        name = f"{slug(span_text(html, 'lblDistrict'), span_text(html, 'lblTaluka'), span_text(html, 'lblVillage'))}-{month}.html"
        if month != ym:
            print(f"   note: the page's dates are for {month}, not {ym}; saved under {month}.")
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        (RAW_DIR / name).write_text(html, encoding="utf-8")
        rows = max(table.count("<tr") - 1, 0) if table else 0
        print(f"   saved scripts/raw/{name} ({rows} entries)")
        saved += 1
        # Close extra tabs the result opened, keep the form tab.
        for pg in list(context.pages):
            if pg is not page:
                try:
                    pg.close()
                except PlaywrightError:
                    pass
    return saved


def run_712(context, page: Page, surveys: list[str], names: tuple[str, str, str], manual: bool, today: dt.date) -> None:
    district, taluka, village = names
    for survey in surveys:
        print(f"\n7/12 survey {survey}")
        open_form(page)
        if not manual:
            fill_common(page, ["vf-7", "vf 7", "૭/૧૨", "7/12", "ગામ નમુના નં. ૭", "ગામ નમૂના નં. ૭"], district, taluka, village)
            choose(page, "Survey no.", [survey], exact=True)
        else:
            print(f"   Fill the VF-7 form for survey {survey} yourself.")
        focus_captcha(page)
        prompt = "   Type the CAPTCHA, press the button, and when the 7/12 is on screen press Enter here (s = skip, q = stop): "
        while True:
            answer = wait_for_enter(prompt)
            if answer in ("q", "s"):
                break
            html, still_form = page_html_for_712(context, page)
            if still_form and wait_for_enter("   This still looks like the search form (wrong CAPTCHA?). Save it anyway? [y/N] ") != "y":
                continue
            if html:
                save_712(survey, html, today)
            break
        if answer == "q":
            break
        for pg in list(context.pages):
            if pg is not page:
                try:
                    pg.close()
                except PlaywrightError:
                    pass


def rebuild_and_publish(ask: bool) -> None:
    print("\nRebuilding src/data/land/echavdi.json …")
    if subprocess.run("npm run data:build", shell=True, cwd=ROOT).returncode != 0:
        print("data:build failed; nothing published.")
        return
    status = subprocess.run("git status --porcelain -- src/data/land/echavdi.json scripts/raw", shell=True, cwd=ROOT, capture_output=True, text=True)
    if not status.stdout.strip():
        print("No change to the public data.")
        return
    print(status.stdout.rstrip())
    if not ask:
        print("Not published (--no-push). Commit src/data/land/echavdi.json and scripts/raw/ when ready.")
        return
    if wait_for_enter("Publish to the live site now (commit + push to main)? [y/N] ") != "y":
        print("Not published. Commit src/data/land/echavdi.json and scripts/raw/ when ready.")
        return
    branch = subprocess.run("git rev-parse --abbrev-ref HEAD", shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if branch != "main":
        print(f"You are on branch {branch!r}, not main, so nothing was pushed. Switch to main and commit the data there.")
        return
    stamp = dt.date.today().isoformat()
    for cmd in (
        "git add src/data/land/echavdi.json scripts/raw",
        f'git commit -m "Update e-Chavdi notices ({stamp})"',
        "git pull --rebase origin main",
        "git push origin main",
    ):
        if subprocess.run(cmd, shell=True, cwd=ROOT).returncode != 0:
            print(f"Stopped at: {cmd}")
            return
    print("Pushed. GitHub deploys the site in a few minutes.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--chavdi", action="store_true", help="only e-Chavdi notices")
    ap.add_argument("--712", dest="seven", action="store_true", help="only 7/12 of your survey numbers")
    ap.add_argument("--months", help="comma-separated yyyy-mm to fetch instead of the missing ones")
    ap.add_argument("--no-current", action="store_true", help="do not re-check the current month")
    ap.add_argument("--manual", action="store_true", help="do not fill the forms; just save the pages")
    ap.add_argument("--no-push", action="store_true", help="rebuild but never commit or push")
    args = ap.parse_args()
    do_chavdi = args.chavdi or not args.seven
    do_712 = args.seven or not args.chavdi

    today = dt.date.today()
    names = village_names()
    months = [m.strip() for m in args.months.split(",")] if args.months else months_to_fetch(*names, today, not args.no_current)
    surveys = my_land() if do_712 else []

    print(f"Village: {' / '.join(names)}")
    if do_chavdi:
        print(f"e-Chavdi months: {', '.join(months) or 'none missing'}")
    if do_712:
        print(f"7/12 for: {', '.join(surveys)}")
    print("A browser window opens. You only type each CAPTCHA and press the button. Keep the pace human.\n")

    saved = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(locale="en-US", viewport={"width": 1280, "height": 900})
        page = context.new_page()
        try:
            if do_chavdi and months:
                saved = run_chavdi(context, page, months, names, args.manual)
            if do_712 and surveys and browser.is_connected():
                run_712(context, page, surveys, names, args.manual, today)
        except KeyboardInterrupt:
            print("\nStopped.")
        finally:
            try:
                browser.close()
            except PlaywrightError:
                pass

    if saved:
        rebuild_and_publish(ask=not args.no_push)
    print("\nDone.")


if __name__ == "__main__":
    main()
