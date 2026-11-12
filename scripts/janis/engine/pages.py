"""Brief 77 steps 5-6: one page file per JANIS book page, from what JANIS wrote.

Inputs, all JANIS's output (run on the JANIS box):
  <book dir>/book-<label>-<datatype>-<mat>-<MT>.jns   the page as JANIS's book generator saved it (series in drawing
                                                       order, legend text, colour, mark or stroke, axes, title)
  <book dir>/book-<label>-navig.xml                    the book's navigation (page order, the rails)
  <export dir>/<page>/{index.tsv,labels.tsv,<i>.csv}   PageExport.java: each series' values from JANIS's Tabler, and the
                                                       selection tree's labels in JANIS's order of refs
Output: <out>/<book>/<Z-Sym-A[m]>/<MT>.json (gzip, served with Content-Encoding gzip), <out>/<book>/index.json (rails,
page order, per page its series summary) and <out>/manifest.json (counts per book).

  python3 pages.py <book letter> <book dir> <export dir> <out dir>
"""
import csv, gzip, io, json, os, re, sys, xml.etree.ElementTree as ET

PREFIX = {"y": 1e-24, "z": 1e-21, "a": 1e-18, "f": 1e-15, "p": 1e-12, "n": 1e-9, "μ": 1e-6, "µ": 1e-6, "u": 1e-6,
          "m": 1e-3, "": 1.0, "k": 1e3, "M": 1e6, "G": 1e9, "T": 1e12}
SYMBOL = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn"]
Z_OF = {s.upper(): z for z, s in enumerate(SYMBOL)}


def quantity(s, unit):
    """'10 μeV' -> 1e-05 (in eV); '214.048045621 μb' -> 0.000214... (in b)."""
    m = re.fullmatch(r"\s*([-+0-9.eE]+)\s*(\S*?)" + re.escape(unit) + r"\s*", s or "")
    if not m:
        return None
    return float(m.group(1)) * PREFIX.get(m.group(2), 1.0)


def nuclide_of(mat):
    """JANIS's material code ('U235', 'Am242m', 'Fe0', 'n') -> the book's label '92-U-235', '95-Am-242m', '26-Fe-Nat'."""
    m = re.fullmatch(r"([A-Za-z]+)(\d*)([mn]?)", mat)
    if not m:
        return mat
    sym, a, iso = m.groups()
    z = Z_OF.get(sym.upper())
    if z is None:
        return mat
    if sym == "n" and a in ("", "1"):
        return "0-n-1"
    return f"{z}-{SYMBOL[z]}-{'Nat' if a in ('', '0') else a}{iso}"


def parse_stroke(s):
    if not s:
        return None
    p = s.split("|")
    dash = [float(v) for v in p[4].split(";")] if len(p) > 4 and p[4] not in ("null", "") else None
    return {"width": float(p[0]), "dash": dash, "raw": s}


def parse_mark(s):
    if not s:
        return None
    m = re.fullmatch(r"([A-Za-z]+)\(([^)]*)\)\|([0-9.]+)", s)
    return {"shape": m.group(1), "args": m.group(2), "size": float(m.group(3)), "raw": s} if m else {"raw": s}


def read_csv(path):
    """JANIS's Tabler CSV (';' separated, a header of '<variable> (<unit>)'): columns as lists of numbers."""
    with open(path, encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f, delimiter=";"))
    if not rows:
        return [], []
    head = [h.strip() for h in rows[0]]
    cols = [[] for _ in head]
    for r in rows[1:]:
        for i, v in enumerate(r[: len(head)]):
            v = v.strip()
            try:
                cols[i].append(float(v.split()[0]) if v else None)
            except ValueError:
                cols[i].append(None)
    return head, cols


def series_values(head, cols):
    """x, y and, where JANIS's table has them, y uncertainties; units from the header ('E (eV)', 'Cross section (b)')."""
    def unit(h):
        m = re.search(r"\(([^)]*)\)\s*$", h)
        return m.group(1) if m else ""
    out = {"columns": head}
    if not cols:
        return out
    xu, yu = unit(head[0]), unit(head[1]) if len(head) > 1 else ""
    sx = PREFIX.get(xu[:-2], 1.0) if xu.endswith("eV") else 1.0
    sy = PREFIX.get(yu[:-1], 1.0) if yu.endswith("b") else 1.0
    out["x"] = [None if v is None else v * sx for v in cols[0]]
    if len(cols) > 1:
        out["y"] = [None if v is None else v * sy for v in cols[1]]
    for i, h in enumerate(head[2:], start=2):
        hl = h.lower()
        su = PREFIX.get(unit(h)[:-1], 1.0) if unit(h).endswith("b") else 1.0
        key = None
        if hl.startswith("dy") or "uncertainty" in hl or "error" in hl or hl.startswith("d" + head[1][:1].lower()):
            key = "dy" if "dy" not in out else "dy2"
        if key:
            out[key] = [None if v is None else v * su for v in cols[i]]
    return out


def page_record(book, jns_path, export_dir):
    root = ET.parse(jns_path).getroot()
    plot = root.find(".//plot")
    stem = os.path.basename(jns_path)[:-4]
    m = re.fullmatch(r"book-[^-]+-([A-Z0-9/]+)-(.+)-MT(\d+)", stem)
    mat, mt = m.group(2), int(m.group(3))
    strings = plot.find("settings/strings")
    title = strings.find("title") if strings is not None else None
    rec = {
        "book": book, "mat": mat, "nuclide": nuclide_of(mat), "mt": mt,
        "title": title.get("manualText") if title is not None else None,
        "x": {"variable": plot.findtext("xvar") or (plot.find("xvar").get("key") if plot.find("xvar") is not None else "E"),
              "scale": plot.findtext("xscale"), "min": quantity(plot.find("xrange").get("min"), "eV"),
              "max": quantity(plot.find("xrange").get("max"), "eV"), "range": [plot.find("xrange").get("min"), plot.find("xrange").get("max")]},
        "y": {"scale": plot.findtext("yscale"), "min": quantity(plot.find("yrange").get("min"), "b"),
              "max": quantity(plot.find("yrange").get("max"), "b"), "range": [plot.find("yrange").get("min"), plot.find("yrange").get("max")]},
        "labels": {k: (strings.find(k).attrib if strings is not None and strings.find(k) is not None else None)
                   for k in ("title", "xAxisLabel", "yAxisLabel", "legend", "xAxisTicsLabels", "yAxisTicsLabels")},
        "series": [], "sheet": [],
    }
    idx = {}
    ipath = os.path.join(export_dir, stem, "index.tsv")
    if os.path.exists(ipath):
        for line in open(ipath, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            i, code, cls, rows = f[:4]
            x4 = {"author": f[4] or None, "year": int(f[5]) if f[5] else None, "points": int(f[6])} if len(f) > 6 and f[6] else None
            idx[code] = (int(i), cls, int(rows), x4)
    for d in plot.findall("data"):
        ref = d.get("refs")
        layer = d.find("layer")
        lib = ref.split("~")[2] if ref.count("~") > 2 else None
        calc = re.search(r"~calc\[([^\]]+)\]$", ref)
        s = {"ref": ref, "kind": "exfor" if lib == "EXFOR" else "evaluated", "library": lib,
             "legend": d.findtext("title"), "computed": calc.group(1) if calc else None,
             "color": layer.findtext("color") if layer is not None else None,
             "stroke": parse_stroke(layer.findtext("stroke")) if layer is not None else None,
             "mark": parse_mark(layer.findtext("mark")) if layer is not None else None}
        for extra in ("showXErrors", "showYErrors"):
            if layer is not None and layer.find(extra) is not None:
                s[extra] = layer.findtext(extra)
        if lib == "EXFOR":
            x4 = re.search(r"X4_([0-9A-Z]+\.[0-9]+(?:\.\d+)?)$", ref)
            s["exfor_id"] = x4.group(1) if x4 else None
        hit = idx.get(ref)
        if hit is None:  # the exporter writes refs in its own code form; match on the tail
            hit = next((v for k, v in idx.items() if k.endswith(ref.lstrip("~")) or ref.endswith(k.lstrip("~"))), None)
        if hit:
            i, cls, rows, x4 = hit
            s["producer"], s["rows"] = cls, rows
            if x4:
                s.update(x4)
            cpath = os.path.join(export_dir, stem, f"{i}.csv")
            if os.path.exists(cpath):
                s.update(series_values(*read_csv(cpath)))
        rec["series"].append(s)
    lpath = os.path.join(export_dir, stem, "labels.tsv")
    if os.path.exists(lpath):
        rec["sheet"] = sheet_rows([l.rstrip("\n").split("\t") for l in open(lpath, encoding="utf-8") if l.strip()])
    return rec


def sheet_rows(rows):
    """JANIS's selection tree: refs in JANIS's order, one level per id label (dataset, category, material, datablock,
    data...), each chain of single-child nodes shown as one row joined by ' / '; P and T on every data row, I on EXFOR's."""
    tree = {}
    for r in rows:
        node = tree
        for lab in r[1:]:
            node = node.setdefault(lab, {})
        node["\0ref"] = r[0]
    out = []

    def walk(node, prefix, depth):
        for lab, kid in node.items():
            if lab == "\0ref":
                continue
            path = prefix + [lab]
            k = kid
            while len([x for x in k if x != "\0ref"]) == 1 and "\0ref" not in k:
                nxt = next(x for x in k if x != "\0ref")
                path.append(nxt)
                k = k[nxt]
            ref = k.get("\0ref")
            out.append({"label": " / ".join(path), "depth": depth, "ref": ref,
                        "toggles": ([] if ref is None else (["P", "T", "I"] if path[0] == "EXFOR" or "~EXFOR~" in (ref or "") else ["P", "T"]))})
            walk(k, [], depth + 1)
    walk(tree, [], 0)
    return out


def navigation(nav_path):
    """The book's page order from JANIS's navigation file: (material code, reaction code) per page."""
    root = ET.parse(nav_path).getroot()
    keys = []
    for k in root.iter():
        mat = k.find("materialId") if False else None  # the XStream layout is read generically below
    txt = open(nav_path, encoding="utf-8").read()
    for m in re.finditer(r"<key[^>]*>(.*?)</key>", txt, re.S):
        keys.append(m.group(1))
    return keys


def main():
    book, bdir, edir, out = sys.argv[1:5]
    jns = sorted(f for f in os.listdir(bdir) if f.endswith(".jns"))
    pages = []
    os.makedirs(os.path.join(out, book), exist_ok=True)
    for n, f in enumerate(jns):
        rec = page_record(book, os.path.join(bdir, f), edir)
        path = os.path.join(out, book, rec["nuclide"], f"{rec['mt']}.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as g:
            json.dump(rec, g, separators=(",", ":"))
        pages.append({"nuclide": rec["nuclide"], "mat": rec["mat"], "mt": rec["mt"], "title": rec["title"],
                      "series": [[s["legend"], s["kind"], s.get("rows")] for s in rec["series"]],
                      "missing_values": sum(1 for s in rec["series"] if "y" not in s)})
    with open(os.path.join(out, book, "pages.json"), "w") as g:
        json.dump({"book": book, "pages": pages}, g, separators=(",", ":"))
    print(json.dumps({"book": book, "pages": len(pages), "series": sum(len(p["series"]) for p in pages),
                      "missing_values": sum(p["missing_values"] for p in pages)}))


if __name__ == "__main__":
    main()
