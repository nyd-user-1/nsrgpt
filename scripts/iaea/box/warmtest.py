# Diagnose the challenge on the box: load a page through one proxy line with automation flags off, screenshot over time,
# and click the Turnstile checkbox if one shows. Writes PNGs and a log to <out>.
#   xvfb-run -a /opt/pw/bin/python warmtest.py <url> <line> <s3-out-prefix> [nodriver]
import json, sys, time, boto3, asyncio
url, line, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
s3 = boto3.client("s3", region_name="us-east-2"); B = "nsr-lake-613473203863"
ip, port, user, pw, _ = boto3.client("ssm", region_name="us-east-2").get_parameter(Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"].splitlines()[line].split(":")
log = []
def note(*a): log.append(" ".join(str(x) for x in a)); print(*a, flush=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch(channel="chrome", headless=False, proxy={"server": f"http://{ip}:{port}", "username": user, "password": pw},
                           args=["--disable-blink-features=AutomationControlled", "--no-first-run"], ignore_default_args=["--enable-automation"])
    ctx = br.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    pg = ctx.new_page()
    try:
        r = pg.goto(url, timeout=90000, wait_until="domcontentloaded"); note("status", r.status if r else None)
    except Exception as e:
        note("goto error", str(e)[:200])
    for t in (5, 15, 30, 50, 75):
        time.sleep(t - (0 if t == 5 else [5, 15, 30, 50][[15, 30, 50, 75].index(t)]))
        title = pg.title(); note(t, "title:", title, "frames:", [f.url[:80] for f in pg.frames])
        s3.put_object(Bucket=B, Key=f"{out}/shot-{t}.png", Body=pg.screenshot())
        if "moment" not in title.lower():
            note("cleared at", t); break
        for f in pg.frames:
            if "challenges.cloudflare.com" in f.url:
                try:
                    box = f.frame_element().bounding_box(); note("turnstile box", box)
                    pg.mouse.click(box["x"] + 30, box["y"] + box["height"] / 2); note("clicked")
                except Exception as e:
                    note("click error", str(e)[:150])
    note("cookies", [c["name"] for c in ctx.cookies()])
    s3.put_object(Bucket=B, Key=f"{out}/log.txt", Body="\n".join(log).encode())
    br.close()
