"""Mark JANIS Web's crawled tree against the lake (brief 68). Runs on the crawl box beside crawl.py.

  python3 mark.py            # reads lake/janis/2026-11-10/tree-raw.json; writes tree.json, held.json (first run)

Every node gets `mark` and the `rule` that decided it:
  missing  JANIS has it and the lake does not
  same     both hold it
  ours     the lake holds it and JANIS does not (nodes added here, below the rows JANIS lists)
Rules, from the lake:
- Category: same when the lake holds data for its projectile (an ENDF sublibrary or EXFOR reactions with it), else
  missing. Nuclear properties and Radioactive data: same (NUBASE2020 through the Live Chart holdings; decay data).
- Library: same for the releases in nsr.endfb_materials (ENDF/B-VI.8, VII.0, VII.1, VIII.0, JEFF-3.3, CENDL-3.2 among
  JANIS's), EXFOR, and Nubase 2020; every other library missing (BROND, EAF, FENDL, GEFY, IRDF, IRDFF, JEF-2.2, older
  JEFF, JEFF-4.0, older JENDL and the JENDL/* families, RUSFOND, PADF, TENDL before 2023, the TSL libraries, Nubase
  1997 to 2016, the -HE and MG variants).
- Data type under a held release: same when the lake has the MF in the category's sublibrary (nsr.endfb_sections for MF3;
  endfb_ang, endfb_edist, endfb_eang, endfb_mult, endfb_photon_*, endfb_cov, endfb_res_ranges and endfb_res_cov for the
  rest; endfb_fy and endfb_decay for MF8; fission yields by product nuclide, as JANIS lists them, since brief 70) (cross sections
  MF3, angular MF4, energy MF5, energy-angle MF6, fission yields MF8 MT454/459, decay MF8 MT457, resonances MF2, nu
  MF1 MT452/455/456, covariances MF31-35 and 40, photon production MF12-15, multiplicities MF9-10); under EXFOR, same
  (every quantity family is held as points or in the X4Pro tables).
- Element and isotope under a held (release, type): same when nsr.endfb_sections has a section of that MF for that
  nuclide in that release and sublibrary (one query, compared with JANIS's list); under EXFOR, when
  nsr.exfor_serve_search_index has a dataset for that projectile and target.
- Leaf (an MT row) under a held isotope: same when that MT is held for the nuclide; other leaf rows (general
  information, resonances) take their parent's mark.
A node under a missing node is missing. Ours: ENDF/B-VIII.1, JENDL-5 and TENDL-2023 under each category whose
sublibrary the lake holds, the POINT files (seven temperatures) under neutrons, CINDA under Base, ICRP 107 and RIPL
under Nuclear properties, and the data types a held release has in the lake that JANIS lists none for.
Brief 70 (elpis-fill, 2026-11-11): a JANIS library is a held release whenever its label, "ENDF/" dropped and slashes
turned to hyphens (JENDL/AD-2017 -> JENDL-AD-2017, ENDF/B-VI.8-HE -> B-VI.8-HE), names a release in
nsr.endfb_materials; held.json is rebuilt whenever that table's release list changes. "TSL <release>" rows are that
release's thermal scattering files (MF7; JANIS draws them under "Cross sections", one row per principal scatterer):
same when the release holds MF7 sections. Libraries held as files but not parsed (Nubase texts, multigroup sets) are
in CATALOGUED: same, with a `format` field naming the form and where the files are."""
import csv
import io
import json
import re
import sys
import time

import boto3

BUCKET, REGION, OUT = "nsr-lake-613473203863", "us-east-2", "lake/janis/2026-11-10"
CURRENT = "lake/janis/current"  # brief 70: the split files and index the pages read, served through CloudFront
s3 = boto3.client("s3", region_name=REGION)
athena = boto3.client("athena", region_name=REGION)

RELEASE = {"ENDF/B-VI.8": "B-VI.8", "ENDF/B-VII.0": "B-VII.0", "ENDF/B-VII.1": "B-VII.1", "ENDF/B-VIII.0": "B-VIII.0",
           "JEFF-3.3": "JEFF-3.3", "CENDL-3.2": "CENDL-3.2"}
OURS_RELEASES = ["B-VIII.1", "JENDL-5", "TENDL-2023"]
# every release the lake holds, in JANIS's label form: added as ours under a category whose list lacks it
OURS_LABEL = {"B-VIII.1": "ENDF/B-VIII.1", "JENDL-5": "JENDL-5", "TENDL-2023": "TENDL-2023", "B-VIII.0": "ENDF/B-VIII.0",
              "B-VII.1": "ENDF/B-VII.1", "B-VII.0": "ENDF/B-VII.0", "B-VI.8": "ENDF/B-VI.8", "JEFF-3.3": "JEFF-3.3",
              "CENDL-3.2": "CENDL-3.2"}
# category path segment -> (sublibrary words to match in the lake, EXFOR projectile codes)
CATEGORY = {"N": (["neutron", "nfy", "(root)"], ["N"]), "G": (["photo", "gamma"], ["G"]), "P": (["proton"], ["P"]),
            "D": (["deuteron"], ["D"]), "T": (["triton"], ["T"]), "HE3": (["helium3", "he3", "helion"], ["HE3"]),
            "A": (["alpha"], ["A"]), "RDD": (["decay", "sfy"], []), "PROPS": ([], []), "HVY": ([], ["HI"]),
            "E": (["electro"], ["E"]), "AP": ([], ["AP", "PBAR"]), "KN": ([], ["K-", "KN"]), "KP": ([], ["K+", "KP"]),
            "PIN": ([], ["PI-", "PIN"]), "PIP": ([], ["PI+", "PIP"])}
# a data type's label -> the kinds that hold it ("FY": MF8 MT454/459, "DEC": MF8 MT457, else the MF)
TYPE_KINDS = [("energy-angle", ["6"]), ("angular", ["4"]), ("energy distribution", ["5"]), ("cross section", ["3"]),
              ("fission yield", ["FY"]), ("decay", ["DEC"]), ("radioactive", ["DEC"]), ("resonance", ["2", "32"]),
              ("covarian", ["31", "32", "33", "34", "35", "40"]), ("photon", ["12", "13", "14", "15"]),
              ("gamma", ["12", "13", "14", "15"]), ("multiplicit", ["9", "10"]), ("nu", ["NU"])]
OURS_TYPES = [("Photon production (MF12 to MF15)", ["12", "13", "14", "15"]), ("Multiplicities (MF9, MF10)", ["9", "10"]),
              ("Resonance parameters (MF2)", ["2"]), ("Covariances (MF31 to MF35)", ["31", "32", "33", "34", "35"])]
EL = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb "
      "Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl "
      "Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn").split()
Z_OF = {e.lower(): z for z, e in enumerate(EL)}


def athena_csv(sql):
    qid = athena.start_query_execution(QueryString=sql, QueryExecutionContext={"Database": "nsr"}, WorkGroup="nsrgpt")[
        "QueryExecutionId"]
    while True:
        e = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
        if e["Status"]["State"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(2)
    if e["Status"]["State"] != "SUCCEEDED":
        raise RuntimeError(e["Status"].get("StateChangeReason"))
    loc = e["ResultConfiguration"]["OutputLocation"].replace("s3://", "").split("/", 1)
    body = s3.get_object(Bucket=loc[0], Key=loc[1])["Body"].read().decode()
    return list(csv.DictReader(io.StringIO(body))), e["Statistics"].get("DataScannedInBytes", 0)


def lake_name(label):
    """A JANIS library label as the lake names its release (brief 70): ENDF/B-VII.0 -> B-VII.0, JENDL/AD-2017 -> JENDL-AD-2017,
    IRDF-2002 MG -> IRDF-2002-MG."""
    return label.strip().replace("ENDF/B-", "B-").replace("/", "-").replace(" ", "-")


# Brief 70: libraries the lake holds as files, not parsed into tables: JANIS label -> (format, where the files are).
CATALOGUED = {
    "Nubase 2016": ("AMDC NUBASE2016 text table", "lake/_raw/Nubase-2016/nubase2016.txt"),
    "Nubase 2012": ("AMDC NUBASE2012 text table", "lake/_raw/Nubase-2012/nubtab12.asc"),
    "Nubase 2003": ("AMDC NUBASE2003 text table", "lake/_raw/Nubase-2003/nubtab03.asc"),
    "Nubase 1997": ("AMDC NUBASE97 text table", "lake/_raw/Nubase-1997/nubtab97.asc"),
    "EAF-2007": ("EAF-2007 neutron cross-section tape in EAF's own layout (no MF1 directory)",
                 "lake/_raw/EAF-2007/eaf_n_xs_20070.zip"),
}
# Brief 70: releases parsed only in part; the note rides on the library node.
PARTIAL = {"JENDL-4.0u": "100 of JENDL-4.0u2's 406 neutron materials (fetched before the night's proxy allowance ran out)"}


def lake_has(key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except Exception:  # noqa: BLE001
        return False


def held_sets():
    """held.json: per release and sublibrary the kinds held, and per (release, sublibrary, kind) the nuclides and MTs.
    Rebuilt when nsr.endfb_materials holds a release the cached file lacks (brief 70), or with --fresh."""
    now_rel, _ = athena_csv("SELECT DISTINCT release FROM endfb_materials")
    now_rel = sorted(r["release"] for r in now_rel if r.get("release"))
    try:
        held = json.loads(s3.get_object(Bucket=BUCKET, Key=f"{OUT}/held.json")["Body"].read())
        if "--fresh" not in sys.argv and held.get("release_list") == now_rel:
            return held
    except s3.exceptions.NoSuchKey:
        pass
    rel = ", ".join(f"'{r}'" for r in now_rel)
    rows, scanned = athena_csv(f"""
      SELECT s.release, s.sublibrary,
             CASE WHEN s.mf = 8 AND s.mt IN (454, 459) THEN 'FY' WHEN s.mf = 8 AND s.mt = 457 THEN 'DEC'
                  WHEN s.mf = 1 AND s.mt IN (452, 455, 456) THEN 'NU' ELSE CAST(s.mf AS varchar) END AS kind,
             CAST(s.za AS integer) AS za, coalesce(m.liso, 0) AS liso
      FROM endfb_sections s LEFT JOIN endfb_materials m
        ON m.release = s.release AND m.file_name = s.file_name AND m.mat = s.mat
      WHERE s.release IN ({rel})
      GROUP BY 1, 2, 3, 4, 5""")
    extra, scanned3 = athena_csv(f"""
      SELECT release, sublibrary, 'DEC' AS kind, CAST(za AS integer) AS za, coalesce(liso, 0) AS liso FROM endfb_decay
      WHERE release IN ({rel}) GROUP BY 1, 2, 3, 4, 5
      UNION ALL
      -- brief 70: JANIS lists fission yields by product (Ar41, Ca47, ...), so the held set is the products (ZAFP, FPS), not
      -- the fissioning material
      SELECT f.release, f.sublibrary, 'FY', CAST(f.zafp AS integer), CASE WHEN f.fps > 0 THEN 1 ELSE 0 END
      FROM endfb_fy f WHERE f.release IN ({rel}) AND f.zafp > 0 GROUP BY 1, 2, 3, 4, 5""")
    rows += [dict(zip(("release", "sublibrary", "kind", "za", "liso"), (r.get("release"), r.get("sublibrary"), r.get("kind"), r.get("za"), r.get("liso")))) for r in extra]
    # endfb_sections indexes MF3 only; Files 2, 4 to 15, 32 and 33 sit in their own tables (briefs 43, 56, 64)
    files = [("endfb_ang", "'4'"), ("endfb_edist", "'5'"), ("endfb_eang", "'6'"), ("endfb_mult", "CAST(mf AS varchar)"),
             ("endfb_photon_xs", "CAST(mf AS varchar)"), ("endfb_photon_ang", "'14'"), ("endfb_photon_edist", "'15'"),
             ("endfb_cov", "'33'"), ("endfb_res_ranges", "'2'"), ("endfb_res_cov", "'32'")]
    union = "\n      UNION ALL ".join(f"SELECT DISTINCT release, sublibrary, file_name, mat, {k} AS kind FROM {t} WHERE release IN ({rel})"
                                     for t, k in files)
    more, scanned4 = athena_csv(f"""
      WITH s AS ({union})
      SELECT s.release, s.sublibrary, s.kind, CAST(m.za AS integer) AS za, coalesce(m.liso, 0) AS liso
      FROM s JOIN endfb_materials m ON m.release = s.release AND m.file_name = s.file_name AND m.mat = s.mat
      GROUP BY 1, 2, 3, 4, 5""")
    rows += more
    scanned3 += scanned4
    x4, scanned2 = athena_csv("""SELECT DISTINCT upper(projectile) AS projectile, CAST(target_za AS integer) AS za,
                                 coalesce(target_state, '') AS state FROM exfor_serve_search_index""")
    held = {"releases": {}, "exfor": {}, "scanned_bytes": scanned + scanned2 + scanned3, "release_list": now_rel}
    for r in rows:
        if r["kind"] == "7":  # thermal scattering: the sections carry no nuclide; the release and sublibrary are the holding
            held["releases"].setdefault(r["release"], {}).setdefault(r["sublibrary"], {}).setdefault("7", {})["any"] = 1
            continue
        if not r["za"] or r["za"] == "0":
            continue  # sections without a nuclide (ZA 0 or empty)
        k = held["releases"].setdefault(r["release"], {}).setdefault(r["sublibrary"], {}).setdefault(r["kind"], {})
        k[f"{r['za']}:{r['liso']}"] = 1
    for r in x4:
        if not r["za"]:
            continue
        held["exfor"].setdefault(r["projectile"], []).append(f"{r['za']}:{1 if r['state'].upper().startswith('M') else 0}")
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/held.json", Body=json.dumps(held).encode(), ContentType="application/json")
    return held


def sublibs(held, release, cat):
    words = CATEGORY.get(cat, ([], []))[0]
    return [s for s in held["releases"].get(release, {}) if any(w in s.lower() for w in words)]


def kinds_of(label):
    low = label.lower()
    for word, kinds in TYPE_KINDS:
        if word in low:
            return kinds
    return []


def nuclide(label):
    """'Ni56' -> '28056:0', 'Am242m' -> '95242:1'; an element row '28 - Ni - Nickel' -> 28."""
    m = re.fullmatch(r"([A-Z][a-z]?)(\d{1,3})([mn]?)\d*", label.strip())
    if m and m.group(1).lower() in Z_OF:
        return f"{Z_OF[m.group(1).lower()] * 1000 + int(m.group(2))}:{1 if m.group(3) else 0}"
    return None


def element_z(label):
    m = re.match(r"\s*(\d{1,3})\s*-", label)
    return int(m.group(1)) if m else None


def set_mark(n, mark, rule):
    n["mark"], n["rule"] = mark, rule


def under(n, mark, rule):
    """Mark a whole subtree."""
    set_mark(n, mark, rule)
    for c in n.get("children", []):
        under(c, mark, rule)


def mark_tree(tree, held):
    set_mark(tree, "same", "the root")
    for cat in tree.get("children", []):
        code = cat["path"].strip("/").split("/")[0]
        words, projs = CATEGORY.get(code, ([], []))
        if code == "HVY":  # EXFOR writes a heavy-ion projectile as a nuclide (12-C-12)
            projs = [k for k in held["exfor"] if k[:1].isdigit()]
        x4 = any(held["exfor"].get(p) for p in projs) or (code == "HVY" and any(k[:1].isdigit() for k in held["exfor"]))
        has_sub = any(sublibs(held, r, code) for r in held["releases"])
        if code in ("PROPS", "RDD") or x4 or has_sub:
            set_mark(cat, "same", "the lake holds this category's data")
        else:
            under(cat, "missing", "the lake holds no data for this projectile")
            continue
        jlabels = set()
        for lib in cat.get("children", []):
            name = lib["label"]
            jlabels.add(name)
            if name == "EXFOR" and code in ("PROPS", "RDD"):
                under(lib, "same", "EXFOR is held whole (nsr.exfor_j4_*)")
            elif name == "EXFOR":
                if x4:
                    mark_exfor(lib, held, projs)
                else:
                    under(lib, "missing", "no EXFOR reactions for this projectile in the lake")
            elif code == "PROPS":
                if name.replace(" ", "").upper() == "NUBASE2020":
                    under(lib, "same", "NUBASE2020, held through the Live Chart holdings")
                elif name in CATALOGUED and lake_has(CATALOGUED[name][1]):
                    catalogued(lib, name)
                else:
                    under(lib, "missing", "an older Nubase; the lake holds NUBASE2020")
            elif name in CATALOGUED and lake_has(CATALOGUED[name][1]):
                catalogued(lib, name)
            elif name.startswith("TSL "):
                rel = lake_name(name[4:])
                subs = sorted(s for s, kinds in held["releases"].get(rel, {}).items() if "7" in kinds)
                if subs:
                    under(lib, "same", f"{rel} holds thermal scattering sections (MF7) in {', '.join(subs)}")
                else:
                    under(lib, "missing", f"no {rel} thermal scattering sections (MF7) in the lake")
            elif lake_name(name) in held["releases"] and sublibs(held, lake_name(name), code):
                mark_release(lib, held, lake_name(name), code)
            else:
                under(lib, "missing", f"{name} is not in nsr.endfb_materials for this category")
        add_ours(cat, code, held, jlabels)


def catalogued(lib, name):
    """Brief 70: held as files, not parsed; the page shows the format instead of a bare mark."""
    fmt, where = CATALOGUED[name]
    under(lib, "same", f"held as files ({fmt}) at {where}; not parsed into tables")
    lib["format"] = fmt


def mark_release(lib, held, release, cat):
    set_mark(lib, "same", f"{release} is in nsr.endfb_materials")
    if release in PARTIAL:
        lib["note"] = PARTIAL[release]
    subs = sublibs(held, release, cat)
    have = {}
    for s in subs:
        for kind, nucs in held["releases"][release][s].items():
            have.setdefault(kind, set()).update(nucs)
    seen = set()
    for t in lib.get("children", []):
        kinds = kinds_of(t["label"])
        seen.update(kinds)
        nucs = set()
        for k in kinds:
            nucs |= have.get(k, set())
        if not nucs:
            under(t, "missing", f"no {'/'.join(kinds) or 'matching'} sections for {release} in the lake")
            continue
        set_mark(t, "same", f"{release} has MF {'/'.join(kinds)} in the lake")
        zs = {int(n.split(':')[0]) // 1000 for n in nucs}
        for el in t.get("children", []):
            z = element_z(el["label"])
            if z is None or z not in zs:
                under(el, "missing", f"no {release} MF {'/'.join(kinds)} section for Z={z}")
                continue
            set_mark(el, "same", f"{release} holds MF {'/'.join(kinds)} for Z={z}")
            isotopes_from_lake(el, nucs, z, f"{release} MF {'/'.join(kinds)}")
    for label, kinds in OURS_TYPES:
        if not seen.intersection(kinds) and any(have.get(k) for k in kinds):
            lib.setdefault("children", []).append({"label": label, "path": lib["path"] + "/" + label, "href": None,
                                                    "children": [], "mark": "ours",
                                                    "rule": f"{release} holds MF {'/'.join(kinds)}; JANIS lists no such type"})


def iso_label(nuc):
    """'28058:0' -> 'Ni58', '95242:1' -> 'Am242m': JANIS's isotope label form."""
    za, liso = nuc.split(":")
    z, a = int(za) // 1000, int(za) % 1000
    return f"{EL[z] if z < len(EL) else z}{a}{'m' if liso != '0' else ''}" if a else f"{EL[z] if z < len(EL) else z}0"


def isotopes_from_lake(el, held_nucs, z, what):
    """An element under a library the lake holds: its isotope page was not fetched (brief 68's method), so its rows
    are the lake's isotopes for it, each marked same. JANIS rows already listed (where a page was fetched) are compared."""
    mine = sorted((n for n in held_nucs if int(n.split(":")[0]) // 1000 == z), key=lambda n: (int(n.split(":")[0]), n))
    if el.get("crawled") and el.get("children"):
        for iso in el["children"]:
            nuc = nuclide(iso["label"])
            if nuc and nuc not in held_nucs:
                under(iso, "missing", f"no {what} for {iso['label']} in the lake")
            else:
                under(iso, "same", f"{what} held for {iso['label']}")
        return
    el["children"] = [{"label": iso_label(n), "path": el["path"].rstrip("/") + "/" + iso_label(n), "href": None,
                       "mark": "same", "rule": f"{what} held; listed from the lake (JANIS's page for this element was not fetched)"}
                      for n in mine]


def mark_exfor(lib, held, projs):
    set_mark(lib, "same", "EXFOR is held (nsr.exfor_j4_*, nsr.exfor_serve_*)")
    targets = set()
    for p in projs:
        targets.update(held["exfor"].get(p, []))
    zs = {int(t.split(":")[0]) // 1000 for t in targets}
    for t in lib.get("children", []):
        set_mark(t, "same", "every EXFOR quantity family is held as points or in the X4Pro tables")
        for el in t.get("children", []):
            z = element_z(el["label"])
            if z is not None and z not in zs:
                under(el, "missing", f"no EXFOR dataset in the lake for this projectile on Z={z}")
                continue
            set_mark(el, "same", "EXFOR datasets for this projectile and element are held")
            isotopes_from_lake(el, targets, z, "EXFOR datasets for this projectile")


def ours_node(parent, label, rule, children=()):
    n = {"label": label, "path": parent["path"].rstrip("/") + "/" + label, "href": None, "mark": "ours", "rule": rule,
         "children": [ours_node({"path": parent["path"].rstrip("/") + "/" + label}, c, rule) for c in children]}
    parent.setdefault("children", []).append(n)
    return n


def add_ours(cat, code, held, jlabels):
    for r in OURS_LABEL:
        if OURS_LABEL[r] not in jlabels and r in held["releases"] and sublibs(held, r, code):
            ours_node(cat, OURS_LABEL[r], f"{r} is in nsr.endfb_materials ({', '.join(sublibs(held, r, code))}); JANIS lists it nowhere here")
    if code == "N":
        temps = ["0 K", "293.6 K", "600 K", "900 K", "1200 K", "1500 K", "1800 K"]
        ours_node(cat, "POINT2025 (ENDF/B-VIII.1)", "NNDC's reconstructed, broadened POINT2025, held at seven temperatures", temps)
        ours_node(cat, "POINT2018 (ENDF/B-VIII.0)", "NNDC's reconstructed, broadened POINT2018, held at seven temperatures", temps)
    if code == "PROPS":
        ours_node(cat, "ICRP 107", "nsr.icrp_* (1,252 nuclides); not in JANIS")
        ours_node(cat, "RIPL", "nsr.ripl_* (RIPL-4 levels, gammas and AME2020 masses); not in JANIS")


def counts(n):
    kids = n.get("children", [])
    c = {"children": len(kids), "leaves": 0, "missing": 0, "same": 0, "ours": 0}
    for k in kids:
        sub = counts(k)
        c["leaves"] += sub["leaves"] + (1 if "leaf" in k else 0)
        for m in ("missing", "same", "ours"):
            c[m] += sub[m] + (1 if k.get("mark") == m else 0)
    n["counts"] = c
    return c


def split(tree):
    """The page's files: index.json, the tree down to the data types (each library row has `file`, its whole subtree's
    file, and its data types without their children), and lib-NNN.json per library (the library node, whole)."""
    files, n = {}, 0
    idx = {k: v for k, v in tree.items() if k != "children"}
    idx["children"] = []
    for cat in tree.get("children", []):
        c = {k: v for k, v in cat.items() if k != "children"}
        c["children"] = []
        for lib in cat.get("children", []):
            n += 1
            name = f"lib-{n:03d}.json"
            files[name] = lib
            l = {k: v for k, v in lib.items() if k != "children"}
            l["file"] = name
            l["children"] = [{k: v for k, v in t.items() if k != "children"} for t in lib.get("children", [])]
            c["children"].append(l)
        idx["children"].append(c)
    files["index.json"] = idx
    for name, body in files.items():
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        s3.put_object(Bucket=BUCKET, Key=f"{OUT}/split/{name}", ContentType="application/json", Body=data)
        # brief 70: the copy the Elpis pages read, overwritten each run, through nsr-api's CloudFront
        # (https://daw1qggkn69lv.cloudfront.net/lake/janis/current/<name>, scripts/gnds/cdn.sh), fresh within five minutes
        s3.put_object(Bucket=BUCKET, Key=f"{CURRENT}/{name}", ContentType="application/json", Body=data,
                      CacheControl="public, max-age=300")
    return len(files)


def main():
    # brief 70: --raw=<key> marks another copy of the crawl (a kept version, when the crawl is mid-rebuild)
    raw = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--raw=")), f"{OUT}/tree-raw.json")
    tree = json.loads(s3.get_object(Bucket=BUCKET, Key=raw)["Body"].read())
    held = held_sets()
    mark_tree(tree, held)
    ours_node(tree, "CINDA", "nsr.cinda_lines (603,010 lines); JANIS searches CINDA but its tree has no CINDA row")
    totals = counts(tree)
    tree["generated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = json.dumps(tree, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/tree.json", Body=body, ContentType="application/json")
    print(json.dumps({"bytes": len(body), "totals": totals, "split_files": split(tree)}))


if __name__ == "__main__":
    sys.exit(main())
