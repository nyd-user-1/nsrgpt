"""Brief 57, Part C.2: what the evaluators have said in public about ENDF/B-VIII.1, fetched from the sweep box. Each page
is saved under lake/sweep/2026-11-10/public-lists/ with its URL, HTTP status and fetch time (sources.json); the nuclides
each page names go to /data/sweep/public_list.json (source_url, za, liso, mt, note), which sweep.py eval_flags loads as
sweep_public_list. A page that names a material is taken to cover every reaction of it (mt "all"), unless a reaction
such as "(n,f)" stands within 40 characters of the name, so a flag is only raised where no public page names the material
or that reaction: the conservative reading. A source that refuses or is not public is listed as such, never guessed.
  HOME=/root venv/bin/python -I public.py
"""
import datetime
import html
import json
import re
import sys
import os
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reactions import ELEMENTS, map_reaction  # noqa: E402

import boto3  # noqa: E402

BUCKET = "nsr-lake-613473203863"
PREFIX = "lake/sweep/2026-11-10/public-lists"
UA = "Mozilla/5.0 (compatible; nsr-sweep/1.0)"
NNDC_REL = "https://www.nndc.bnl.gov/endf-releases/releases"
SEEDS = [
    ("NNDC ENDF releases: VIII.1 sublibrary descriptions", f"{NNDC_REL}/descriptions.json"),
    ("NNDC ENDF releases: VIII.1 metadata", f"{NNDC_REL}/B-VIII.1/metadata.json"),
    ("NNDC ENDF releases: VIII.1 neutrons changelog (linked from the metadata)",
     "https://www.nndc.bnl.gov/endf-releases/changelog.html?sublibrary=neutrons"),
    ("NNDC ENDF/B-VIII.1 page", "https://www.nndc.bnl.gov/endf-b8.1/"),
    ("NNDC ENDF/B-VIII.1 release notes", "https://www.nndc.bnl.gov/endf-b8.1/ENDF-B-VIII.1-release-notes.html"),
    ("NNDC ENDF/B-VIII.1 release notes (pdf)", "https://www.nndc.bnl.gov/endf-b8.1/ENDF-B-VIII.1-release-notes.pdf"),
    ("NNDC ENDF/B-VIII.1 known issues", "https://www.nndc.bnl.gov/endf-b8.1/known-issues.html"),
    ("NNDC ENDF/B-VIII.0 page", "https://www.nndc.bnl.gov/endf-b8.0/"),
    ("NNDC ENDF libraries index", "https://www.nndc.bnl.gov/endf/"),
    ("CSEWG page", "https://www.nndc.bnl.gov/csewg/"),
    ("NNDC GitLab ENDF projects (API)", "https://git.nndc.bnl.gov/api/v4/projects?search=endf&per_page=100"),
    ("NNDC GitLab explore", "https://git.nndc.bnl.gov/explore/projects"),
    ("GitHub nndc organization (API)", "https://api.github.com/orgs/nndc/repos?per_page=100"),
    ("GitHub issues mentioning ENDF/B-VIII.1 (community, not USNDP; API)",
     "https://api.github.com/search/issues?q=%22ENDF%2FB-VIII.1%22&per_page=100"),
    ("IAEA CIELO", "https://www-nds.iaea.org/CIELO/"),
    ("IAEA INDEN", "https://www-nds.iaea.org/INDEN/"),
    ("IAEA standards", "https://www-nds.iaea.org/standards/"),
    ("NEA WPEC subgroups", "https://www.oecd-nea.org/jcms/pl_20541/wpec-subgroups"),
]
FOLLOW = re.compile(r"release|notes|known|issue|change|summary|errata|readme|log", re.I)
s3 = boto3.client("s3", region_name="us-east-2")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "", e.read() if hasattr(e, "read") else b""
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:200], b""


def text_of(body, ctype):
    if "pdf" in ctype or body[:4] == b"%PDF":
        return None  # no PDF reader on the box; the page is saved, not read
    t = body.decode("utf-8", "replace")
    try:  # a JSON page: its strings, joined
        j = json.loads(t)
        acc = []

        def walk(v):
            if isinstance(v, str):
                acc.append(v)
            elif isinstance(v, dict):
                for x in v.values():
                    walk(x)
            elif isinstance(v, list):
                for x in v:
                    walk(x)
        walk(j)
        t = " \n ".join(acc)
    except ValueError:
        pass
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"(?i)<sup>([^<]*)</sup>\s*", r"\1", t)  # <sup>54,56,57</sup>Fe -> 54,56,57Fe
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", html.unescape(t))

    def expand(m):  # 54,56,57Fe -> 54Fe 56Fe 57Fe; 28-30Si -> 28Si 29Si 30Si
        out = []
        for part in re.split(r"\s*,\s*", m.group(1)):
            a = re.split(r"\s*[-–]\s*", part)
            if len(a) == 2 and a[0].isdigit() and a[1].isdigit() and 0 <= int(a[1]) - int(a[0]) <= 10:
                out += [str(x) for x in range(int(a[0]), int(a[1]) + 1)]
            else:
                out += [x for x in a if x.isdigit()]
        return " " + " ".join(f"{x}{m.group(2)}" for x in out) + " "
    return re.sub(r"(?<![\w.])(\d{1,3}(?:\s*[-–,]\s*\d{1,3})+)([A-Z][a-z]?)(?![a-z])", expand, t)


WORDS = {"In", "As", "At", "No", "Be", "He", "Am", "Es", "Pa", "Re", "Ti", "Ho", "Os", "Ga", "Ne", "Er", "Hf"}


def elements_alone(text):
    """Element symbols standing alone in a list ('..., Dy, ..., Pt, ...'): every isotope of the element."""
    out = []
    for m in re.finditer(rf"(?:(?<=, )|(?<=and ))({SYM})(?=,| and |;|\.)", text):
        sym = m.group(1)
        if len(sym) == 2 and sym not in WORDS:
            out.append((ELEMENTS.index(sym) * 1000, 0, [], text[max(0, m.start() - 40): m.end() + 40].strip()))
    return out


SYM = "|".join(sorted((e for e in ELEMENTS[1:]), key=len, reverse=True))
PATTERNS = [
    re.compile(rf"\b(?:n-)?(\d{{3}})_({SYM})_(\d{{3}})(m?)\b"),                     # n-092_U_235 (ENDF file names)
    re.compile(rf"(?<![\w/.-])({SYM})-?(\d{{1,3}})(m\d?)?(?![\w.]|\.\d)"),          # U-235, U235, Am242m
    re.compile(rf"(?<![\w/.-])(\d{{1,3}})(m\d?)?({SYM})(?![a-z])"),                 # 235U, 242mAm
]
REACTION = re.compile(r"\(\s*([npdtaγg]|he3|3he|alpha)\s*,\s*([a-z0-9+γ']{1,12})\s*\)", re.I)
PART = {"n": "N", "p": "P", "d": "D", "t": "T", "a": "A", "alpha": "A", "he3": "HE3", "3he": "HE3", "g": "G", "γ": "G"}


def nuclides(text):
    out = []
    for i, p in enumerate(PATTERNS):
        for m in p.finditer(text):
            if i == 0:
                z, sym, a, iso = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
                if ELEMENTS.index(sym) != z:
                    continue
            elif i == 1:
                sym, a, iso = m.group(1), int(m.group(2)), m.group(3) or ""
            else:
                a, iso, sym = int(m.group(1)), m.group(2) or "", m.group(3)
            z = ELEMENTS.index(sym)
            if not (z <= a <= 3 * z + 12) or (z == 0):
                continue
            ctx = text[max(0, m.start() - 40): m.end() + 40]
            mts = []
            for r in REACTION.finditer(ctx):
                proj = PART.get(r.group(1).lower())
                proc = r.group(2).upper().replace("'", "").replace("Γ", "G").replace("γ", "G")
                proc = {"N": "INL" if proj == "N" else "N"}.get(proc, proc)
                sub, mt, _, _ = map_reaction(proj or "", proc)
                if mt:
                    mts.append(mt)
            out.append((z * 1000 + a, 1 if iso.startswith("m") else 0, mts, ctx.strip()))
    return out


def main():
    now = lambda: datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    sources, rows, seen = [], [], set()
    queue = list(SEEDS)
    while queue:
        name, url = queue.pop(0)
        if url in seen or len(seen) > 40:
            continue
        seen.add(url)
        status, ctype, body = fetch(url)
        slug = re.sub(r"[^A-Za-z0-9]+", "-", url.split("://", 1)[-1]).strip("-")[:120]
        rec = {"name": name, "url": url, "status": status, "content_type": ctype, "bytes": len(body), "fetched_at": now()}
        if body:
            key = f"{PREFIX}/{slug}"
            s3.put_object(Bucket=BUCKET, Key=key, Body=body)
            rec["saved"] = f"s3://{BUCKET}/{key}"
        if status != 200:
            rec["outcome"] = "not reached" if status is None else f"HTTP {status}"
            sources.append(rec)
            continue
        text = text_of(body, ctype)
        if text is None:
            rec["outcome"] = "saved; a PDF, not read on the box"
            sources.append(rec)
            continue
        found = nuclides(text) + (elements_alone(text) if "nndc.bnl.gov" in url else [])
        rec["nuclides_named"] = len({(z, l) for z, l, _, _ in found})
        rec["outcome"] = "read"
        sources.append(rec)
        for za, liso, mts, ctx in found:
            for mt in (mts or ["all"]):
                rows.append({"source_url": url, "za": za, "liso": liso, "mt": str(mt), "note": ctx[:200]})
        if url.startswith("https://www.nndc.bnl.gov/endf-b8"):  # one level of links that look like notes or issues
            for href in re.findall(r'href="([^"#]+)"', body.decode("utf-8", "replace")):
                full = urllib.parse.urljoin(url, href)
                if FOLLOW.search(href) and full.startswith("https://www.nndc.bnl.gov/") and full not in seen:
                    queue.append((f"linked from {url}", full))
    dedup = {(r["source_url"], r["za"], r["liso"], r["mt"]): r for r in rows}
    out = list(dedup.values())
    json.dump(out, open("/data/sweep/public_list.json", "w"))
    s3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/sources.json", Body=json.dumps(sources, indent=1).encode(),
                  ContentType="application/json")
    print(json.dumps({"sources": [(s["name"], s["url"], s.get("outcome"), s.get("nuclides_named")) for s in sources],
                      "rows": len(out)}, indent=1))


if __name__ == "__main__":
    import urllib.parse  # noqa: F401
    main()
