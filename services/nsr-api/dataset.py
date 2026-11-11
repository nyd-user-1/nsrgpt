# dataset: one record per dataset, for the dataset pages (brief 34, ui-layer). lambda_function.py sends /dataset,
# /exfor/entry and /endf/material here (MODULES). README.md has every route's shape; in short:
#   GET /dataset/{source}?nucid=60CO | ?mass=60      ENSDF (2026-11-05) or XUNDL (2026-10-01) datasets, as NNDC's index
#   GET /dataset/{source}/{id}[/text|/md|/pdf]       one dataset: header, levels, gammas, other records, comments,
#                                                    references, its cards as held; or the cards, Markdown, a PDF
#   GET /exfor/entry/{id}[/text]                     an EXFOR entry with its subentries and X4 text (X4Pro 2023-07-14)
#   GET /endf/material/{release}/{mat}[/text]        an ENDF/B material: header, sections, one section's lines
# Every record carries `graph`: the node Graph draws for it and its links. DuckDB reads the parsed Parquet straight from
# the lake; the small ENSDF and XUNDL tables load into memory on first use, the cards (sorted by dataset) are read one row
# group at a time.
import base64
import bisect
import io
import json
import os
import re
import urllib.parse
import zipfile

import duckdb

import structure  # brief 70: the release list lives there

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
L = f"s3://{BUCKET}/lake"
SOURCES = {"ensdf": ("ENSDF", "ensdf/2026-11-05", "2026-11-05"), "xundl": ("XUNDL", "xundl/2026-10-01", "2026-10-01")}
NSRDB = f"{L}/nsr-database/2026-10-15/nsr"
X4SRC = f"{L}/exfor/x4pro-2023-07-14/X4SRC/*.parquet"
J4 = f"{L}/exfor/j4-2026-10-28"
NSR_SERVE = f"{L}/serve/search/{os.environ.get('SEARCH_VERSION', '2026-11-08')}/nsr/*"
ENDF_RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II",
                 "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]  # brief 43 added the last four
ENDF_RELEASES += [r for r in structure.RELEASES if r not in ENDF_RELEASES]  # brief 70: structure.py's list
PUBLIC = os.environ.get("PUBLIC_BASE", "https://daw1qggkn69lv.cloudfront.net")
HERE = os.path.dirname(os.path.abspath(__file__))
# The small per-dataset tables, held in memory per container (about 60 MB of Parquet for both releases).
TABLES = ["datasets", "levels", "gammas", "comments", "parents", "qvalues", "normalization", "betas", "ec", "alphas",
          "delayed", "xrefs", "other_records", "references"]
_con = None
_loaded = set()


def con():
    global _con
    if _con is None:
        c = duckdb.connect(config={"home_directory": "/tmp",
                                   "extension_directory": os.environ.get("DUCKDB_EXT_DIR", f"{HERE}/duckdb_ext"),
                                   "temp_directory": "/tmp/duckdb-dataset", "threads": 2})
        c.execute("LOAD httpfs")
        for s in ("enable_object_cache", "enable_http_metadata_cache"):
            try:
                c.execute(f"SET {s} = true")
            except duckdb.Error:
                pass
        key, secret, token = (os.environ["AWS_ACCESS_KEY_ID"], os.environ["AWS_SECRET_ACCESS_KEY"],
                              os.environ.get("AWS_SESSION_TOKEN", ""))
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{key}', SECRET '{secret}', SESSION_TOKEN '{token}', "
                  "REGION 'us-east-2')")
        _con = c
    return _con


def table(source, name):
    """A small ENSDF or XUNDL table, loaded into memory the first time a route needs it."""
    t = f"{source}_{name}"
    if t not in _loaded:
        con().execute(f"CREATE OR REPLACE TABLE {t} AS SELECT * FROM read_parquet('{L}/{SOURCES[source][1]}/{name}/*')")
        _loaded.add(t)
    return t


def records(sql, params=()):
    cur = con().cursor().execute(sql, list(params))
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def text_response(body, ctype):
    return {"statusCode": 200, "headers": {"Content-Type": f"{ctype}; charset=utf-8", "Access-Control-Allow-Origin": "*",
                                           "Cache-Control": "public, max-age=3600"}, "body": body}


# ---------------------------------------------------------------------------------------------
# Names

SYMBOLS = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr "
           "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt "
           "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv "
           "Ts Og").split()


def nuclide_label(nucid):
    """60CO -> 60Co; a bare mass (a references dataset's NUCID) stays as it is."""
    m = re.fullmatch(r"\s*(\d+)\s*([A-Za-z]{1,2})\s*", nucid or "")
    return f"{m.group(1)}{m.group(2)[0].upper()}{m.group(2)[1:].lower()}" if m else (nucid or "").strip()


def nuclide_link(nucid, z=None, a=None, rel="nuclide"):
    m = re.fullmatch(r"\s*(\d+)\s*([A-Za-z]{1,2})\s*", nucid or "")
    if not m:
        return None
    sub = f"Z={z} N={a - z}" if z is not None and a is not None else ""
    return {"type": "nuclide", "id": f"{m.group(1)}{m.group(2).upper()}", "label": nuclide_label(nucid), "sub": sub, "rel": rel}


def paper_link(key, rel="reference"):
    return {"type": "paper", "id": key, "label": key, "rel": rel}


def parse_id(raw):
    """NUCID:DSID, URL-encoded once or twice."""
    s = urllib.parse.unquote(urllib.parse.unquote(raw)).strip()
    if ":" not in s:
        raise ValueError("a dataset id is NUCID:DSID, as 60CO:ADOPTED LEVELS, GAMMAS")
    nucid, dsid = s.split(":", 1)
    return nucid.strip().upper(), dsid.strip()


def ds_id(source, nucid, dsid):
    return f"{nucid.strip()}:{dsid}"


# ---------------------------------------------------------------------------------------------
# /dataset/{source}

def listing(source, q):
    nucid = (q.get("nucid") or "").strip().upper()
    mass = (q.get("mass") or "").strip()
    if not nucid and not mass:
        raise ValueError("give ?nucid= (as 60CO) or ?mass= (as 60)")
    t = table(source, "datasets")
    where, params = ("trim(nucid) = ?", [nucid]) if nucid else ("a = ?", [int(mass)])
    rows = records(f"SELECT nucid, dsid, dstype, date, publication, level_count, gamma_count, card_count, z, a "
                   f"FROM {t} WHERE {where} ORDER BY z, dataset_seq", params)
    name, _, release = SOURCES[source]
    out = []
    for r in rows:
        nid = r["nucid"].strip()
        out.append({"id": ds_id(source, nid, r["dsid"]), "nucid": nid, "dsid": r["dsid"], "type": r["dstype"],
                    "date": r["date"], "publication": r["publication"], "levels": r["level_count"],
                    "gammas": r["gamma_count"], "cards": r["card_count"],
                    "graph": graph_node(source, nid, r["dsid"], r["date"], r["z"], r["a"])})
    return 200, {"source": source, "release": release, "nucid": nucid or None, "mass": int(mass) if mass else None,
                 "total": len(out), "rows": out}


def graph_node(source, nucid, dsid, date, z, a, links=None):
    name = SOURCES[source][0]
    node = {"type": "dataset", "id": f"{source}:{nucid}:{dsid}", "label": f"{nuclide_label(nucid)} {dsid}",
            "sub": f"{name} {date or ''}".strip()}
    if links is None:
        nl = nuclide_link(nucid, z, a)
        links = [nl] if nl else []
    return {"node": node, "links": links}


# ---------------------------------------------------------------------------------------------
# /dataset/{source}/{id}

def strip(row, *drop):
    return {k: v for k, v in row.items() if k not in ("release", "dataset_seq", "nucid", "dsid", "continuation") + drop}


def dataset(source, raw_id):
    nucid, dsid = parse_id(raw_id)
    head = records(f"SELECT * FROM {table(source, 'datasets')} WHERE trim(nucid) = ? AND dsid = ?", [nucid, dsid])
    if not head:
        return None
    h = head[0]
    seq = h["dataset_seq"]
    name, folder, release = SOURCES[source]
    by = lambda t, order="card_seq": records(f"SELECT * FROM {table(source, t)} WHERE dataset_seq = ? ORDER BY {order}", [seq])

    history = json.loads(h["history"]) if h.get("history") else []
    last = history[-1] if history else {}
    header = {"nucid": nucid, "dsid": dsid, "type": h["dstype"], "date": h["date"], "publication": h["publication"],
              "authors": last.get("AUT"), "citation": last.get("CIT"), "cutoff": last.get("CUT"), "history": history,
              "dsref": [k.strip() for k in (h.get("dsref") or "").split(",") if k.strip()]}

    levels_raw, gammas_raw, comments_raw = by("levels"), by("gammas"), by("comments")
    # A level or gamma comment sits on the last card of its record type before it.
    owners = {"L": [r["card_seq"] for r in levels_raw], "G": [r["card_seq"] for r in gammas_raw]}
    attached = {"L": {}, "G": {}}
    general = []
    for c in comments_raw:
        rt = (c.get("rtype") or "").upper()
        if rt in owners and owners[rt]:
            i = bisect.bisect_left(owners[rt], c["card_seq"]) - 1
            if i >= 0:
                attached[rt].setdefault(owners[rt][i], []).append(c["text"])
                continue
        general.append({"card_seq": c["card_seq"], "type": c["comment_type"], "rtype": c["rtype"], "text": c["text"]})

    levels = [{"seq": r["level_seq"], "energy_kev": r["energy_kev"], "energy": r["energy_kev_raw"],
               "unc": r["energy_unc_raw"], "jpi": r["jpi"],
               "half_life": " ".join(x for x in (r["half_life_raw"], r["half_life_unc_raw"]) if x) or None,
               "l": r["l"], "s": r["s_raw"], "flag": r["flag"], "ms": r["ms"], "band": r["band"],
               "comments": attached["L"].get(r["card_seq"], [])} for r in levels_raw]
    energy_of = {l["seq"]: l["energy_kev"] for l in levels}
    known = sorted((l["energy_kev"], l["seq"]) for l in levels if l["energy_kev"] is not None)
    gammas = []
    for r in gammas_raw:
        start = energy_of.get(r["level_seq"])
        to = None
        if start is not None and r["e_gamma"] is not None:
            target, tol = start - r["e_gamma"], max(1.0, 0.002 * r["e_gamma"])
            hits = [e for e, _ in known if abs(e - target) <= tol]
            to = hits[0] if len(hits) == 1 else None
        gammas.append({"level_seq": r["level_seq"], "from_kev": start, "to_kev": to, "energy_kev": r["e_gamma"],
                       "energy": r["e_gamma_raw"], "unc": r["unc_raw"], "ri": r["ri_raw"], "ri_unc": r["ri_unc_raw"],
                       "mult": r["mult"], "mr": r["mr_raw"], "cc": r["cc_raw"], "ti": r["ti_raw"], "flag": r["flag"],
                       "comments": attached["G"].get(r["card_seq"], [])})

    q = by("qvalues")
    qvalue = strip(q[0], "card_seq") if q else None
    other = {k: [strip(r) for r in by(t)] for k, t in
             (("betas", "betas"), ("ec", "ec"), ("alphas", "alphas"), ("delayed", "delayed"), ("xrefs", "xrefs"),
              ("records", "other_records"))}
    parents = [strip(r) | {"nucid": r["nucid"].strip()} for r in by("parents")]

    refs_table = f"{NSRDB}/public.{source}_refs/**/*.parquet"
    keys = [r["key_number"] for r in records(f"SELECT DISTINCT key_number FROM read_parquet('{refs_table}') "
                                             "WHERE trim(nucid) = ? AND dsid = ? ORDER BY 1", [nucid, dsid])]
    keys = sorted(set(keys) | set(header["dsref"]))
    texts = {}
    if keys and h.get("a") is not None:
        # The reference as the mass chain's references dataset writes it; XUNDL's own is nearly empty, so ENSDF's fills in.
        for src in dict.fromkeys([source, "ensdf"]):
            missing = [k for k in keys if k not in texts]
            if missing:
                texts |= {r["keynum"]: r["reference"] for r in records(
                    f"SELECT keynum, reference FROM {table(src, 'references')} WHERE trim(nucid) = ? AND keynum IN "
                    f"({', '.join('?' * len(missing))})", [str(h['a'])] + missing)}
    missing = [k for k in keys if not texts.get(k)]
    if missing:  # last, NSR's own reference line
        texts |= {r["key_number"]: r["reference"] for r in records(
            f"SELECT key_number, reference FROM read_parquet('{NSR_SERVE}') WHERE key_number IN "
            f"({', '.join('?' * len(missing))})", missing)}
    references = [{"key": k, "reference": texts.get(k)} for k in keys]

    cards = [r["text"] for r in records(f"SELECT text FROM read_parquet('{L}/{folder}/cards/*') WHERE dataset_seq = ? "
                                        "ORDER BY line_no", [seq])]

    links = [x for x in [nuclide_link(nucid, h["z"], h["a"])] if x]
    links += [nuclide_link(p["nucid"], rel="decay_parent") for p in parents if nuclide_link(p["nucid"])]
    if h["dstype"] != "adopted":
        adopted = records(f"SELECT dsid FROM {table(source, 'datasets')} WHERE trim(nucid) = ? AND dstype = 'adopted' "
                          "LIMIT 1", [nucid])
        if adopted:
            links.append({"type": "dataset", "id": f"{source}:{nucid}:{adopted[0]['dsid']}",
                          "label": f"{nuclide_label(nucid)} {adopted[0]['dsid']}", "rel": "parent"})
    links += [paper_link(k) for k in keys[:60]]
    return {"source": source, "release": release, "id": ds_id(source, nucid, dsid), "header": header, "qvalue": qvalue,
            "parents": parents, "normalization": [strip(r) for r in by("normalization")], "levels": levels,
            "gammas": gammas, "other": other, "comments": general, "references": references, "cards": cards,
            "graph": graph_node(source, nucid, dsid, h["date"], h["z"], h["a"], links)}


# ---------------------------------------------------------------------------------------------
# Markdown and PDF. ENSDF writes Greek letters as |p, |g, … and super- and subscripts as {+3}, {-2}.

GREEK = dict(zip("abgdezhqiklmnxoprstufcywABGDEZHQIKLMNXOPRSTUFCYW", "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"))


def greek(s):
    return re.sub(r"\|([A-Za-z])", lambda m: GREEK.get(m.group(1), m.group(1)), s or "")


def plain(s):
    return re.sub(r"\{[+-]([^}]*)\}", r"\1", greek(s))


def field_text(s):
    """ENSDF writes a comment on one field as FIELD$text; shown as FIELD: text."""
    return re.sub(r"^([A-Z][A-Z0-9,()+\-]*)\$", r"\1: ", s or "")


QNAMES = {"q_minus": "Q(β−)", "sn": "S(n)", "sp": "S(p)", "qa": "Q(α)"}


def md_cell(v):
    return plain(str(v)).replace("|", "\\|").replace("\n", " ").strip() if v not in (None, "") else ""


def markdown(d):
    h = d["header"]
    name = SOURCES[d["source"]][0]
    out = [f"# {nuclide_label(h['nucid'])} {h['dsid']}", ""]
    for label, v in (("Source", f"{name} {d['release']}"), ("NUCID", h["nucid"]), ("Dataset type", h["type"]),
                     ("Date", h["date"]), ("Publication", h["publication"]), ("Authors", h["authors"]),
                     ("Citation", h["citation"]), ("Literature cutoff", h["cutoff"])):
        if v:
            out.append(f"- **{label}:** {v}")
    if d["qvalue"]:
        qv = d["qvalue"]
        out.append("- **Q-values (keV):** " + ", ".join(f"{QNAMES[k]} {qv.get(k + '_raw') or ''} {qv.get(k + '_unc_raw') or ''}".strip()
                                                       for k in QNAMES if qv.get(k) is not None))
    out.append("")
    if d["comments"]:
        out += ["## Comments", ""] + [f"> {plain(field_text(c['text']))}".replace("\n", "\n> ") if c["text"] else ">"
                                      for c in d["comments"]] + [""]
    if d["levels"]:
        out += ["## Levels", "", "| E(level) keV | Jπ | T½ | L | Comments |", "| --- | --- | --- | --- | --- |"]
        for l in d["levels"]:
            e = f"{l['energy'] or ''} {l['unc'] or ''}".strip()
            out.append(f"| {md_cell(e)} | {md_cell(l['jpi'])} | {md_cell(l['half_life'])} | {md_cell(l['l'])} | "
                       f"{md_cell(' '.join(field_text(c) for c in l['comments']))} |")
        out.append("")
    if d["gammas"]:
        out += ["## Gammas", "", "| E(level) keV | Eγ keV | Iγ | Mult. | δ | α | E(final) keV |",
                "| --- | --- | --- | --- | --- | --- | --- |"]
        for g in d["gammas"]:
            e = f"{g['energy'] or ''} {g['unc'] or ''}".strip()
            ri = f"{g['ri'] or ''} {g['ri_unc'] or ''}".strip()
            out.append(f"| {md_cell(g['from_kev'])} | {md_cell(e)} | {md_cell(ri)} | {md_cell(g['mult'])} | "
                       f"{md_cell(g['mr'])} | {md_cell(g['cc'])} | {md_cell(g['to_kev'])} |")
        out.append("")
    if d["references"]:
        out += ["## References", ""] + [f"- [{r['key']}]({PUBLIC}/nsr/{r['key']})" + (f" {r['reference']}" if r["reference"] else "")
                                        for r in d["references"]] + [""]
    return "\n".join(out)


INK, MUTED, FAINT, RULE, QUIET, STRONG = "#16181d", "#787a7e", "#a2a3a5", "#e6e6e7", "#f6f6f7", "#033882"
_fonts = False


def fonts():
    """DejaVu, for the Greek letters and the minus sign ENSDF's values carry; vendored in fonts/ by build.sh."""
    global _fonts
    if not _fonts:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.fonts import addMapping
        for name, file in (("Sans", "DejaVuSans.ttf"), ("Sans-Bold", "DejaVuSans-Bold.ttf"), ("Mono", "DejaVuSansMono.ttf")):
            pdfmetrics.registerFont(TTFont(name, os.path.join(HERE, "fonts", file)))
        addMapping("Sans", 0, 0, "Sans")
        addMapping("Sans", 1, 0, "Sans-Bold")
        _fonts = True


def rich(s):
    """Card text to reportlab's markup: escaped, Greek letters, {+n} and {-n} as super- and subscripts."""
    s = (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\{\+([^}]*)\}", r"<super>\1</super>", greek(s))
    return re.sub(r"\{-([^}]*)\}", r"<sub>\1</sub>", s)


class _Kit:
    """reportlab's pieces in the paper palette's print form, shared by the dataset PDF and the other records' PDFs."""

    def __init__(self):
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import LongTable, Paragraph, Preformatted, SimpleDocTemplate, TableStyle

        fonts()
        self.colors, self.letter, self.inch = colors, letter, inch
        self.LongTable, self.Paragraph, self.Preformatted, self.SimpleDocTemplate, self.TableStyle = \
            LongTable, Paragraph, Preformatted, SimpleDocTemplate, TableStyle
        st = lambda n, **k: ParagraphStyle(n, fontName=k.pop("font", "Sans"), textColor=colors.HexColor(k.pop("color", INK)), **k)
        self.H1 = st("h1", fontSize=17, leading=21, font="Sans-Bold", color=STRONG, spaceAfter=4)
        self.H2 = st("h2", fontSize=11.5, leading=15, font="Sans-Bold", color=STRONG, spaceBefore=12, spaceAfter=5)
        self.META = st("meta", fontSize=8.5, leading=11.5, color=MUTED)
        self.BODY = st("body", fontSize=8.5, leading=11)
        self.CELL = st("cell", fontSize=7.5, leading=9.5)
        self.HEAD = st("head", fontSize=7.5, leading=9.5, font="Sans-Bold", color=MUTED)
        self.QUOTE = st("quote", fontSize=7.5, leading=9.5, font="Mono", color=INK, leftIndent=8)
        self.PRE = st("pre", fontSize=6.4, leading=7.8, font="Mono", color=INK)
        self.WIDTH = letter[0] / inch - 1.4  # inches between the margins

    def p(self, markup, style):
        return self.Paragraph(markup, style)

    def h2(self, label, count=None):
        return self.p(label + (f" <font color='{MUTED}' size='8.5'>{count}</font>" if count is not None else ""), self.H2)

    def field(self, label, value):
        return self.p(f"<font color='{MUTED}'>{label}</font>  {rich(str(value))}", self.BODY)

    def grid(self, head, rows, widths=None):
        if widths is None:  # by content, each column 4 to 40 characters wide
            n = [min(40, max(4, len(str(h)), *(len(str(r[i] if r[i] is not None else "")) for r in rows[:200])))
                 for i, h in enumerate(head)]
            widths = [self.WIDTH * w / sum(n) for w in n]
        data = [[self.p(rich(str(x)), self.HEAD) for x in head]] + [[self.p(rich(str(c)) if c not in (None, "") else "", self.CELL)
                                                                     for c in r] for r in rows]
        t = self.LongTable(data, colWidths=[w * self.inch for w in widths], repeatRows=1)
        c = self.colors
        t.setStyle(self.TableStyle([("BACKGROUND", (0, 0), (-1, 0), c.HexColor(QUIET)),
                                    ("LINEBELOW", (0, 0), (-1, 0), 0.6, c.HexColor(INK)),
                                    ("LINEBELOW", (0, 1), (-1, -1), 0.3, c.HexColor(RULE)),
                                    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5), ("LEFTPADDING", (0, 0), (-1, -1), 3),
                                    ("RIGHTPADDING", (0, 0), (-1, -1), 3)]))
        return t

    def pre(self, text):
        return self.Preformatted(text, self.PRE)

    def build(self, story, title, author, subject, footer):
        c, inch, letter = self.colors, self.inch, self.letter

        def page(canvas, doc):
            canvas.saveState()
            canvas.setFont("Sans", 7)
            canvas.setFillColor(c.HexColor(FAINT))
            canvas.drawString(0.7 * inch, 0.45 * inch, footer)
            canvas.drawRightString(letter[0] - 0.7 * inch, 0.45 * inch, f"Page {doc.page}")
            canvas.restoreState()

        buf = io.BytesIO()
        doc = self.SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.7 * inch, rightMargin=0.7 * inch, topMargin=0.7 * inch,
                                     bottomMargin=0.7 * inch, title=title, author=author, subject=subject)
        doc.build(story, onFirstPage=page, onLaterPages=page)
        return buf.getvalue()


def pdf(d):
    k = _Kit()
    h = d["header"]
    name = SOURCES[d["source"]][0]
    title = f"{nuclide_label(h['nucid'])} {h['dsid']}"
    story = [k.p(rich(title), k.H1)]
    meta = [f"{name} {d['release']}", h["type"] and f"{h['type']} dataset", h["date"] and f"dated {h['date']}"]
    story.append(k.p(" · ".join(x for x in meta if x), k.META))
    for label, v in (("Authors", h["authors"]), ("Citation", h["citation"]), ("Literature cutoff", h["cutoff"]),
                     ("Publication", h["publication"])):
        if v:
            story.append(k.field(label, v))
    if d["qvalue"]:
        qv = d["qvalue"]
        names = {"q_minus": "Q(β<super>−</super>)", "sn": "S(n)", "sp": "S(p)", "qa": "Q(α)"}
        parts = [f"{names[n]} {rich(qv.get(n + '_raw') or '')} {rich(qv.get(n + '_unc_raw') or '')}" for n in names
                 if qv.get(n) is not None]
        if parts:
            story.append(k.p(f"<font color='{MUTED}'>Q-values (keV)</font>  " + "   ".join(parts), k.BODY))
    if d["levels"]:
        story.append(k.h2("Levels", len(d["levels"])))
        story.append(k.grid(["E(level) keV", "Jπ", "T½", "L", "Comments"],
                            [[f"{l['energy'] or ''} {l['unc'] or ''}".strip(), l["jpi"], l["half_life"], l["l"],
                              " ".join(field_text(c) for c in l["comments"])] for l in d["levels"]], [1.05, 0.85, 1.05, 0.45, 3.6]))
    if d["gammas"]:
        story.append(k.h2("Gammas", len(d["gammas"])))
        story.append(k.grid(["E(level) keV", "Eγ keV", "Iγ", "Mult.", "δ", "α", "E(final) keV", "Comments"],
                            [[g["from_kev"], f"{g['energy'] or ''} {g['unc'] or ''}".strip(),
                              f"{g['ri'] or ''} {g['ri_unc'] or ''}".strip(), g["mult"], g["mr"], g["cc"], g["to_kev"],
                              " ".join(field_text(c) for c in g["comments"])] for g in d["gammas"]],
                            [0.8, 0.85, 0.7, 0.55, 0.55, 0.6, 0.8, 2.15]))
    if d["comments"]:
        story.append(k.h2("Comments"))
        story += [k.p(rich(field_text(c["text"])).replace("\n", "<br/>") or "&nbsp;", k.QUOTE) for c in d["comments"]]
    if d["references"]:
        story.append(k.h2("References", len(d["references"])))
        story += [k.p(f"<link href='{PUBLIC}/nsr/{r['key']}' color='{STRONG}'>{r['key']}</link>"
                      + (f"  <font color='{MUTED}'>{rich(r['reference'])}</font>" if r["reference"] else ""), k.BODY)
                  for r in d["references"]]
    return k.build(story, title, h["authors"] or name, f"{name} dataset", f"NSRgpt · {name} {d['release']} · {title}")


# ---------------------------------------------------------------------------------------------
# The other records' Markdown and PDF (EXFOR entries and subentries, ENDF/B materials, NSR papers): one document, a
# title, a line under it, the header as fields, then sections that are each a table, a list or the raw text. Markdown
# has everything; the PDF stops a table at 2,000 rows and the raw text at 3,000 lines and says where the rest is.

PDF_ROWS, PDF_LINES = 2000, 3000


def doc_md(doc):
    out = [f"# {doc['title']}", ""]
    if doc.get("meta"):
        out += [" · ".join(doc["meta"]), ""]
    out += [f"- **{label}:** {md_cell(v)}" for label, v in doc["fields"] if v not in (None, "", [])]
    out.append("")
    for s in doc["sections"]:
        out += [f"## {s['heading']}", ""]
        if "table" in s:
            cols, rows = s["table"]
            out += ["| " + " | ".join(md_cell(c) for c in cols) + " |", "| " + " | ".join("---" for _ in cols) + " |"]
            out += ["| " + " | ".join(md_cell(c) for c in r) + " |" for r in rows]
        if "items" in s:
            out += [f"- [{label}]({href})" + (f" {rest}" if rest else "") if href else f"- {label}" + (f" {rest}" if rest else "")
                    for label, href, rest in s["items"]]
        if "text" in s:
            fence = "~~~" if "```" in s["text"] else "```"
            out += [fence + "text", s["text"].rstrip("\n"), fence]
        out.append("")
    return "\n".join(out)


def doc_pdf(doc):
    k = _Kit()
    story = [k.p(rich(doc["title"]), k.H1)]
    if doc.get("meta"):
        story.append(k.p(rich(" · ".join(doc["meta"])), k.META))
    story += [k.field(label, v) for label, v in doc["fields"] if v not in (None, "", [])]
    for s in doc["sections"]:
        if "table" in s:
            cols, rows = s["table"]
            story.append(k.h2(s["heading"], len(rows)))
            story.append(k.grid(cols, rows[:PDF_ROWS]))
            if len(rows) > PDF_ROWS:
                story.append(k.p(f"The first {PDF_ROWS:,} of {len(rows):,} rows; the Markdown has them all.", k.META))
        if "items" in s:
            story.append(k.h2(s["heading"], len(s["items"])))
            story += [k.p((f"<link href='{href}' color='{STRONG}'>{rich(label)}</link>" if href else rich(label))
                          + (f"  <font color='{MUTED}'>{rich(rest)}</font>" if rest else ""), k.BODY) for label, href, rest in s["items"]]
        if "text" in s:
            lines = s["text"].rstrip("\n").split("\n")
            story.append(k.h2(s["heading"], f"{len(lines):,} lines"))
            story.append(k.pre("\n".join(lines[:PDF_LINES])))
            if len(lines) > PDF_LINES:
                story.append(k.p(f"The first {PDF_LINES:,} of {len(lines):,} lines; {doc.get('text_url', 'the text route')} has them all.", k.META))
    return k.build(story, doc["title"], doc.get("author") or "NSRgpt", doc.get("subject") or "", f"NSRgpt · {doc['title']}")


def doc_response(doc, kind, file):
    if kind == "md":
        return text_response(doc_md(doc), "text/markdown")
    return {"statusCode": 200, "isBase64Encoded": True, "body": base64.b64encode(doc_pdf(doc)).decode(),
            "headers": {"Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*",
                        "Content-Disposition": f'inline; filename="{re.sub(r"[^A-Za-z0-9.-]+", "-", file).strip("-")}.pdf"',
                        "Cache-Control": "public, max-age=3600"}}


def bib_fields(bib):
    """EXFOR's BIB keywords as fields: each keyword's codes, then its free text."""
    out = []
    for kw, entries in (bib or {}).items():
        parts = []
        for e in entries or []:
            ci = e.get("coded_information")
            code = ci.get("code") if isinstance(ci, dict) else ", ".join(map(str, ci)) if isinstance(ci, list) else ci
            free = " ".join(t.strip() for t in (e.get("free_text") or []) if t and t.strip())
            parts.append(" ".join(x for x in ((f"({code})" if code else ""), free) if x))
        if any(parts):
            out.append((kw.replace("_", " ").title(), "; ".join(p for p in parts if p)))
    return out


def exfor_entry_doc(e):
    en = e["entry"]
    lst = lambda v: ", ".join(v) if isinstance(v, list) else v
    return {"title": f"EXFOR {e['id']}", "meta": [x for x in (en["title"], en["year"] and str(en["year"])) if x],
            "author": lst(en["authors"]), "subject": "EXFOR entry", "text_url": f"{PUBLIC}/exfor/entry/{e['id']}/text",
            "fields": [("Entry", e["id"]), ("Title", en["title"]), ("Year", en["year"]), ("Authors", lst(en["authors"])),
                       ("Institutes", lst(en["institutes"])), ("References", lst(en["references"])), ("Entry date", en["date"]),
                       ("Subentries", en["n_subentries"]), ("X4 text", e["x4_source"])],
            "sections": [s for s in [
                {"heading": "Subentries", "table": (["Subentry", "Reaction", "Quantity", "Target", "Data rows"],
                                                    [[s["subent"], lst(s["reaction"]), lst(s["quantity"]), lst(s["target"]), s["n_data_rows"]]
                                                     for s in e["subentries"]])} if e["subentries"] else None,
                {"heading": "Papers", "items": [(k, f"{PUBLIC}/nsr/{k}", "") for k in e["papers"]]} if e["papers"] else None,
                {"heading": "X4 text", "text": e["x4"]} if e["x4"] else None] if s]}


def exfor_subentry_doc(b, x4):
    sub, en = b.get("subentry") or {}, b.get("entry") or {}
    lst = lambda v: ", ".join(map(str, v)) if isinstance(v, list) else v
    cols = b.get("columns") or []
    heads = [f"{c['name']} ({c['unit']})" if c.get("unit") else c["name"] for c in cols]
    sections = []
    if b.get("datasets"):
        sections.append({"heading": "Datasets", "table": (["Dataset", "Pointer", "Reaction code", "Energy min eV", "Energy max eV", "Points"],
                                                          [[d["dataset"], d["pointer"], d["code"], d["energy_min_ev"], d["energy_max_ev"], d["points"]]
                                                           for d in b["datasets"]])})
    if b.get("common"):
        sections.append({"heading": "Common", "table": (["Name", "Unit", "Value"],
                                                        [[c["name"], c["unit"], c["value"] if c["value"] is not None else c["value_text"]]
                                                         for c in b["common"]])})
    if cols:
        sections.append({"heading": "Data", "table": (heads, b.get("rows") or [])})
    if x4:
        sections.append({"heading": "X4 text", "text": x4})
    return {"title": f"EXFOR {b['id']}", "meta": [x for x in (en.get("title"), en.get("year") and str(en["year"])) if x],
            "author": lst(en.get("authors")), "subject": "EXFOR subentry",
            "fields": [("Subentry", sub.get("subent")), ("Entry", sub.get("entry"))]
                      + ([] if (b.get("bib") or {}).get("REACTION") else [("Reaction", lst(sub.get("reaction")))])
                      + [("Authors", lst(en.get("authors"))), ("Year", en.get("year")), ("Subentry date", sub.get("date"))]
                      + bib_fields(b.get("bib")),
            "sections": sections}


def endf_doc(e):
    m = e["material"]
    title = f"{(m.get('zsymam') or '').strip() or 'MAT ' + str(e['mat'])} · ENDF/{e['release']} MAT {e['mat']}"
    t = e["text"]
    return {"title": title, "meta": [f"{e['sublibrary']} sublibrary", m.get("hsub") and m["hsub"].split("\n")[0].strip("- ")],
            "author": m.get("auth"), "subject": "ENDF material",
            "text_url": f"{PUBLIC}/endf/material/{e['release']}/{e['mat']}/text?sub={e['sublibrary']}&mf={t['mf']}&mt={t['mt']}",
            "fields": [("Release", e["release"]), ("MAT", e["mat"]), ("Sublibrary", e["sublibrary"]), ("ZA", m.get("za")),
                       ("AWR", m.get("awr")), ("Temperature K", m.get("temp_k")), ("Laboratory", m.get("alab")),
                       ("Evaluation date", m.get("edate")), ("Authors", m.get("auth")), ("Reference", m.get("ref")),
                       ("Distribution", m.get("ddate")), ("Revision", m.get("rdate")), ("File", m.get("file_name"))],
            "sections": [s for s in [
                {"heading": "Description", "text": m["description"]} if m.get("description") else None,
                {"heading": "Sections", "table": (["MF", "MT", "Reaction", "Lines"],
                                                  [[s["mf"], s["mt"], s["reaction"], s["line_count"]] for s in e["sections"]])},
                {"heading": f"MF{t['mf']} MT{t['mt']}", "text": t["lines"]} if t["lines"] else None] if s]}


def nsr_doc(rec, text):
    split = lambda v: [x.strip() for x in re.split(r"[;,]", v or "") if x.strip()]
    nuclides, reactions = split(rec.get("nuclides")), split(rec.get("reactions"))
    exfor = re.findall(r"\b[0-9A-Z]\d{4}\b", (rec.get("exfor_keys") or "").upper())
    return {"title": rec["key_number"], "meta": [x for x in (rec.get("title"),) if x], "author": rec.get("authors"),
            "subject": "NSR reference",
            "fields": [("Key number", rec["key_number"]), ("Year", rec.get("year")), ("Reference", rec.get("reference")),
                       ("Authors", rec.get("authors")), ("Title", rec.get("title")), ("DOI", rec.get("doi")),
                       ("Type", rec.get("reference_type")), ("Journal", rec.get("journal_code")), ("Keywords", rec.get("keywords")),
                       ("Entered", rec.get("entry_date")), ("Changed", rec.get("modification_date"))],
            "sections": [s for s in [
                {"heading": "Nuclides and reactions", "table": (["Nuclides", "Reactions"],
                                                                [[n, r] for n, r in zip(nuclides + [""] * len(reactions), reactions + [""] * len(nuclides))
                                                                 if n or r])} if nuclides or reactions else None,
                {"heading": "EXFOR entries", "items": [(f"EXFOR {x}", f"{PUBLIC}/exfor/entry/{x}", "") for x in exfor]} if exfor else None,
                {"heading": "Exchange record", "text": text}] if s]}


# ---------------------------------------------------------------------------------------------
# /exfor/entry/{id}

def x4_text(entry, subent=None):
    """An entry's X4 text, or one subentry's, from X4Pro's sources (one zipped text per subentry)."""
    rows = con().cursor().execute(f"SELECT Coding, Src FROM read_parquet('{X4SRC}') WHERE Entry = ?"
                                  + (" AND SubAcc = ?" if subent else "") + " ORDER BY SubAccNum",
                                  [entry] + ([subent] if subent else [])).fetchall()
    parts = []
    for coding, src in rows:
        b = bytes(src or b"")
        if b[:2] == b"PK":  # one zipped text file per subentry
            with zipfile.ZipFile(io.BytesIO(b)) as z:
                b = z.read(z.namelist()[0])
        parts.append(b.decode("latin-1").rstrip("\r\n"))
    return "\n".join(parts).replace("\r\n", "\n") if parts else None


def exfor_entry(eid):
    eid = eid.strip().upper()
    if not re.fullmatch(r"[0-9A-Z]{5}", eid):
        raise ValueError("an EXFOR entry number is five characters, as 10001")
    e = records(f"SELECT title, year, authors, institute, \"references\", date, n_subentries FROM "
                f"read_parquet('{J4}/entries/*') WHERE entry = ?", [eid])
    subs = records(f"SELECT subent, title, reaction, quantity, target, n_data_rows FROM read_parquet('{J4}/subentries/*') "
                   "WHERE entry = ? ORDER BY subent_no", [eid])
    x4 = x4_text(eid)
    if not e and not x4:
        return None
    e = e[0] if e else {}
    papers = [r["key_number"] for r in records(f"SELECT DISTINCT key_number FROM read_parquet('{NSRDB}/public.nsr_exfor/**/*.parquet') "
                                               "WHERE exfor_id = ? ORDER BY 1", [eid])]
    entry = {"title": e.get("title"), "year": e.get("year"), "authors": e.get("authors"), "institutes": e.get("institute"),
             "references": e.get("references"), "date": e.get("date"), "n_subentries": e.get("n_subentries")}
    one = lambda v: (v[0] if v else None) if isinstance(v, list) else v
    return {"id": eid, "entry": entry,
            "subentries": [{"subent": s["subent"], "title": one(s["title"]), "reaction": s["reaction"],
                            "quantity": s["quantity"], "target": s["target"], "n_data_rows": s["n_data_rows"]} for s in subs],
            "x4": x4, "x4_source": "X4Pro 2023-07-14" if x4 else None, "papers": papers,
            "graph": {"node": {"type": "exfor", "id": eid, "label": f"EXFOR {eid}", "sub": entry["title"] or ""},
                      "links": [paper_link(k) for k in papers]}}


# ---------------------------------------------------------------------------------------------
# /endf/material/{release}/{mat}

def endf_material(release, mat, q):
    if release not in ENDF_RELEASES:
        raise ValueError(f"release is one of {', '.join(ENDF_RELEASES)}")
    mat = int(mat)
    sub = (q.get("sub") or "neutrons").strip().lower()
    mf, mt = int(q.get("mf") or 1), int(q.get("mt") or 451)
    base = f"{L}/endfb/{release}"
    rows = records(f"SELECT * FROM read_parquet('{base}/materials/*.parquet') WHERE mat = ? "
                   "ORDER BY (sublibrary = ? OR sublibrary LIKE ? || '-%') DESC, sublibrary = '(root)' DESC", [mat, sub, sub])
    rows = [r for r in rows if r["sublibrary"].split("-")[0] == sub or r["sublibrary"] == "(root)"]
    if not rows:
        return None
    m = rows[0]
    names = {r["mt"]: r for r in records(f"SELECT mt, reaction, name FROM read_parquet('{L}/serve/endf/mt_names/*')")}
    sections = [{"mf": s["mf"], "mt": s["mt"], "reaction": (names.get(s["mt"]) or {}).get("reaction"),
                 "line_count": s["line_count"]}
                for s in records(f"SELECT mf, mt, line_count FROM read_parquet('{base}/sections/*.parquet') "
                                 "WHERE file_name = ? AND mat = ? ORDER BY mf, mt", [m["file_name"], mat])]
    lines = [r["text"] for r in records(f"SELECT text FROM read_parquet('{base}/records/*.parquet') WHERE mat = ? AND mf = ? "
                                        "AND mt = ? AND file_name = ? ORDER BY line_no", [mat, mf, mt, m["file_name"]])]
    z, a = int(m["za"]) // 1000, int(m["za"]) % 1000
    sym = SYMBOLS[z] if 0 < z < len(SYMBOLS) else ""
    links = [{"type": "nuclide", "id": f"{a}{sym.upper()}", "label": f"{a}{sym}", "sub": f"Z={z} N={a - z}", "rel": "nuclide"}] if sym and a else []
    material = {k: m.get(k) for k in ("za", "zsymam", "awr", "temp_k", "lis", "liso", "nlib", "nver", "alab", "edate",
                                      "auth", "ref", "ddate", "rdate", "endate", "hsub", "description", "file_name")}
    return {"release": release, "mat": mat, "sublibrary": sub, "material": material, "sections": sections,
            "text": {"mf": mf, "mt": mt, "lines": "\n".join(lines) if lines else None},
            "graph": {"node": {"type": "material", "id": f"{release}:{mat}", "label": (m.get("zsymam") or "").strip() or f"MAT {mat}",
                               "sub": f"ENDF/{release} MAT {mat}"}, "links": links}}


# ---------------------------------------------------------------------------------------------

def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        m = re.fullmatch(r"/dataset/(ensdf|xundl)", p)
        if m:
            return listing(m.group(1), q)
        m = re.fullmatch(r"/dataset/(ensdf|xundl)/(.+?)(?:/(text|md|pdf))?", p)
        if m:
            d = dataset(m.group(1), m.group(2))
            if d is None:
                return 404, {"error": f"no {m.group(1)} dataset {urllib.parse.unquote(m.group(2))}"}
            if m.group(3) == "text":
                return text_response("\n".join(d["cards"]) + "\n", "text/plain")
            if m.group(3) == "md":
                return text_response(markdown(d), "text/markdown")
            if m.group(3) == "pdf":
                file = re.sub(r"[^A-Za-z0-9]+", "-", f"{d['header']['nucid']} {d['header']['dsid']}").strip("-")
                return {"statusCode": 200, "isBase64Encoded": True, "body": base64.b64encode(pdf(d)).decode(),
                        "headers": {"Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*",
                                    "Content-Disposition": f'inline; filename="{m.group(1)}-{file}.pdf"',
                                    "Cache-Control": "public, max-age=3600"}}
            return 200, d
        m = re.fullmatch(r"/dataset/[^/]+(/.*)?", p)
        if m:
            return 404, {"error": "source is ensdf or xundl"}
        m = re.fullmatch(r"/exfor/entry/([^/]+)(/text|/md|/pdf)?", p)
        if m:
            e = exfor_entry(m.group(1))
            if e is None:
                return 404, {"error": f"no EXFOR entry {m.group(1)}"}
            if m.group(2) in ("/md", "/pdf"):
                return doc_response(exfor_entry_doc(e), m.group(2)[1:], f"exfor-{e['id']}")
            if m.group(2):
                return text_response(e["x4"] + "\n", "text/plain") if e["x4"] else \
                    (404, {"error": f"the lake holds no X4 text for {e['id']} (X4Pro 2023-07-14 predates it)"})
            return 200, e
        m = re.fullmatch(r"/endf/material/([^/]+)/(\d+)(/text|/md|/pdf)?", p)
        if m:
            e = endf_material(m.group(1), m.group(2), q)
            if e is None:
                return 404, {"error": f"no material {m.group(2)} in {m.group(1)} {(q.get('sub') or 'neutrons')}"}
            if m.group(3) in ("/md", "/pdf"):
                return doc_response(endf_doc(e), m.group(3)[1:], f"endf-{e['release']}-{e['mat']}-{e['sublibrary']}")
            if m.group(3):
                return text_response(e["text"]["lines"] + "\n", "text/plain") if e["text"]["lines"] else \
                    (404, {"error": f"MF{e['text']['mf']} MT{e['text']['mt']} is not in this material"})
            return 200, e
        return 404, {"error": "routes: /dataset/{ensdf|xundl}?nucid=|mass=, /dataset/{source}/{id}[/text|/md|/pdf], "
                              "/exfor/entry/{id}[/text|/md|/pdf], /endf/material/{release}/{mat}[/text|/md|/pdf]"}
    except (ValueError, duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
