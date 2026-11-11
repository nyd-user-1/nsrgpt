"""Brief 70: IAEA's ENDF retrieval system (https://www-nds.iaea.org/exfor/endf.htm) through real Chrome on one Webshare
line, for the libraries IAEA's download-endf tree lacks (JEFF-3.0, FENDL-3.1b, the JENDL special files). Runs on the
browser box under xvfb; one page at a time, about one request a second.

  xvfb-run -a /opt/pw/bin/python endfdb.py probe                  # save the rendered search form and its fields
  xvfb-run -a /opt/pw/bin/python endfdb.py search <lib id> <name>  # submit the form for one library, save the results
Writes under lake/_raw/_work/endfdb/.
"""
import json
import sys
import time

import boto3
from playwright.sync_api import sync_playwright

B = "nsr-lake-613473203863"
OUT = "lake/_raw/_work/endfdb"
s3 = boto3.client("s3", region_name="us-east-2")
LINES = [l.split(":") for l in boto3.client("ssm", region_name="us-east-2").get_parameter(
    Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"].splitlines() if l.strip()]
URL = "https://www-nds.iaea.org/exfor/endf.htm"


def put(name, body, ct="text/html"):
    s3.put_object(Bucket=B, Key=f"{OUT}/{name}", Body=body.encode() if isinstance(body, str) else body, ContentType=ct)


def cleared(page, secs=90):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if "moment" not in page.title().lower() and "cf-chl" not in page.content():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    return False


def fields(page):
    return page.eval_on_selector_all(
        "input, select, textarea, form",
        "els => els.map(e => ({tag: e.tagName, type: e.type || '', name: e.name || '', id: e.id || '', "
        "value: (e.value || '').slice(0, 80), checked: !!e.checked, action: e.action || '', "
        "label: (e.parentElement ? e.parentElement.innerText : '').slice(0, 80)}))")


def main():
    step = sys.argv[1]
    ip, port, user, pw, _ = LINES[0]
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", headless=False,
                               proxy={"server": f"http://{ip}:{port}", "username": user, "password": pw},
                               args=["--no-first-run", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
                               ignore_default_args=["--enable-automation"])
        ctx = br.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        page = ctx.new_page()
        page.goto(URL, timeout=90000, wait_until="domcontentloaded")
        ok = cleared(page)
        page.wait_for_timeout(3000)
        if step == "probe":
            put("endf-rendered.html", page.content())
            put("endf-fields.json", json.dumps({"cleared": ok, "title": page.title(), "fields": fields(page)}, indent=1), "application/json")
            print("probe saved", ok, page.title())
        elif step == "search":
            lib, name = sys.argv[2], sys.argv[3]
            # tick only this library's box, leave target and reaction empty (every material), submit
            page.evaluate("""(id) => {
                for (const e of document.querySelectorAll('input[type=checkbox]')) {
                    if (/lib/i.test(e.name) || /lib/i.test(e.id)) e.checked = (e.value == id);
                }
            }""", lib)
            with page.expect_navigation(timeout=120000):
                page.evaluate("() => { if (typeof mySubmit === 'function') mySubmit(); else document.forms[0].submit(); }")
            page.wait_for_timeout(3000)
            links = page.eval_on_selector_all("a[href]", "els => els.map(e => [e.href, e.innerText.slice(0, 60)])")
            put(f"search-{name}.html", page.content())
            put(f"search-{name}.json", json.dumps({"url": page.url, "title": page.title(), "links": links}, indent=1), "application/json")
            print("search saved", name, page.url, len(links))
        br.close()


if __name__ == "__main__":
    main()
