"""Brief 61, Part A: nsr-encoder v2's training pairs, hard negatives, evaluation corpora and frozen benchmark, from the
lake's own joins, on a CPU box (DuckDB over the lake's Parquet). Writes lake/models/nsr-encoder-v2/{pairs,corpus,bench,
train}/ with manifests.

Pair types (query -> positive document):
  ex_nsr        EXFOR dataset line -> NSR paper           nsr_exfor (NSR key <-> EXFOR entry), every dataset of the entry
  ensdf_nsr     ENSDF dataset line -> NSR paper           the dataset's DSREF keynumbers
  endf_nsr      ENDF material line -> NSR paper           a (volume, page, year) in MF1/451's text matching one NSR key
  nuclide       a nuclide's name -> its record lines      Ac-225 / 225Ac / actinium-225 -> ENSDF, ICRP 107, ENDF, EXFOR
  reaction      reaction in words -> EXFOR dataset line   uranium-235 neutron-induced fission cross section
Held out the nsr-eval-v1 way: md5('holdout:' || key) in the first quarter of hash space, for NSR keys (so v2 never trains on
v1's held-out papers), nuclides and reaction triples. Held-out units are never training queries, positives or negatives.
  /opt/parse/bin/python -I build_pairs.py
"""
import collections
import hashlib
import json
import os
import random
import re
import sys
import time

sys.path.insert(0, "/opt/models")
from lakeduck import con, L, s3, BUCKET  # noqa: E402

OUT = "/data/v2"
PREFIX = "lake/models/nsr-encoder-v2"
NEG = 7  # train_group_size 8 = one positive and seven negatives (NSR-CPT)
rnd = random.Random(61)
T0 = time.time()
ELEMENTS = ("n neutron|H hydrogen|He helium|Li lithium|Be beryllium|B boron|C carbon|N nitrogen|O oxygen|F fluorine|"
            "Ne neon|Na sodium|Mg magnesium|Al aluminum|Si silicon|P phosphorus|S sulfur|Cl chlorine|Ar argon|"
            "K potassium|Ca calcium|Sc scandium|Ti titanium|V vanadium|Cr chromium|Mn manganese|Fe iron|Co cobalt|"
            "Ni nickel|Cu copper|Zn zinc|Ga gallium|Ge germanium|As arsenic|Se selenium|Br bromine|Kr krypton|"
            "Rb rubidium|Sr strontium|Y yttrium|Zr zirconium|Nb niobium|Mo molybdenum|Tc technetium|Ru ruthenium|"
            "Rh rhodium|Pd palladium|Ag silver|Cd cadmium|In indium|Sn tin|Sb antimony|Te tellurium|I iodine|"
            "Xe xenon|Cs cesium|Ba barium|La lanthanum|Ce cerium|Pr praseodymium|Nd neodymium|Pm promethium|"
            "Sm samarium|Eu europium|Gd gadolinium|Tb terbium|Dy dysprosium|Ho holmium|Er erbium|Tm thulium|"
            "Yb ytterbium|Lu lutetium|Hf hafnium|Ta tantalum|W tungsten|Re rhenium|Os osmium|Ir iridium|"
            "Pt platinum|Au gold|Hg mercury|Tl thallium|Pb lead|Bi bismuth|Po polonium|At astatine|Rn radon|"
            "Fr francium|Ra radium|Ac actinium|Th thorium|Pa protactinium|U uranium|Np neptunium|Pu plutonium|"
            "Am americium|Cm curium|Bk berkelium|Cf californium|Es einsteinium|Fm fermium|Md mendelevium|"
            "No nobelium|Lr lawrencium|Rf rutherfordium|Db dubnium|Sg seaborgium|Bh bohrium|Hs hassium|"
            "Mt meitnerium|Ds darmstadtium|Rg roentgenium|Cn copernicium|Nh nihonium|Fl flerovium|Mc moscovium|"
            "Lv livermorium|Ts tennessine|Og oganesson")
SYMS = [e.split()[0] for e in ELEMENTS.split("|")]
NAME = {e.split()[0]: e.split()[1] for e in ELEMENTS.split("|")}
Z = {s: z for z, s in enumerate(SYMS)}
UPPER = {s.upper(): s for s in SYMS}
PROJ = {"N": "neutron", "P": "proton", "D": "deuteron", "T": "triton", "HE3": "helium-3", "A": "alpha", "G": "photon",
        "E": "electron", "0": "spontaneous"}
PROC = {"F": "fission", "G": "radiative capture", "EL": "elastic scattering", "INL": "inelastic scattering",
        "TOT": "total", "ABS": "absorption", "NON": "nonelastic", "X": "particle production", "2N": "(n,2n)",
        "P": "proton emission", "A": "alpha emission", "SCT": "scattering", "N": "neutron emission"}
TRAIN_TARGET = {"ex_nsr": 12000, "ensdf_nsr": 12000, "endf_nsr": 4000, "nuclide": 8000, "reaction": 10000}
BENCH_TARGET = {"ex_nsr": 2500, "ensdf_nsr": 2500, "endf_nsr": 1000, "nuclide": 2000, "reaction": 2000}


def held(unit):
    return hashlib.md5(f"holdout:{unit}".encode()).hexdigest()[0] in "0123"


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


def nuc_of(nucid):
    """ENSDF NUCID (60CO, 1NN) -> 60Co; None when it is not a nuclide."""
    m = re.fullmatch(r"\s*(\d{1,3})\s*([A-Z]{0,2})\s*", nucid or "")
    if not m or not m.group(2) or m.group(2) not in UPPER:
        return None
    return f"{int(m.group(1))}{UPPER[m.group(2)]}"


def surname(authors):
    a = (authors or "").split(";")[0].strip()
    a = re.sub(r"\s+", "", a)
    return a.rsplit(".", 1)[-1].lower() if a else None


def fmt_e(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    for u, f in (("MeV", 1e6), ("keV", 1e3), ("eV", 1.0), ("meV", 1e-3)):
        if v >= f or u == "meV":
            return f"{v / f:.3g} {u}"


os.makedirs(OUT, exist_ok=True)
c = con(mem="6GB")
q = lambda sql, p=(): c.execute(sql, list(p)).fetchall()  # noqa: E731

# ---------- the documents ----------
NSR = f"{L}/nsr-database/2026-10-15/nsr"
c.execute(f"""CREATE TABLE papers AS SELECT key_number AS key,
  left(trim(coalesce(title, '') || chr(10) || chr(10) || coalesce(abstract, '')), 2000) AS text,
  try_cast(pub_year AS INTEGER) AS year, authors
  FROM read_parquet('{NSR}/public.nsr/*/*.parquet')
  WHERE length(regexp_replace(coalesce(title, '') || coalesce(abstract, ''), '\\s+', '', 'g')) >= 20""")
papers = {k: (t, y, surname(a)) for k, t, y, a in q("SELECT key, text, year, authors FROM papers")}
log("papers", len(papers))
by_nuc = collections.defaultdict(list)  # (z, a) -> NSR keys
for k, z, a in q(f"SELECT key_number, try_cast(z AS INTEGER), try_cast(a AS INTEGER) FROM "
                 f"read_parquet('{NSR}/public.nsr_nuclides/*/*.parquet')"):
    if k in papers and z is not None and a is not None:
        by_nuc[(z, a)].append(k)
by_author = collections.defaultdict(list)
for k, (t, y, s) in papers.items():
    if s:
        by_author[s].append(k)
log("nuclide index", len(by_nuc), "authors", len(by_author))

# Plain names first for the common quantities (the dictionary leaves SIG's description empty), then the dictionary's.
QWORDS = {"SIG": "cross section", "DA": "angular distribution", "DE": "energy spectrum", "DA/DE": "double-differential cross section",
          "NU": "neutron multiplicity", "FY": "fission product yield", "RI": "resonance integral", "WID": "resonance width",
          "POL/DA": "analyzing power", "TTY": "thick-target yield", "ETA": "neutrons per absorption (eta)",
          "ALF": "capture-to-fission ratio (alpha)", "EN": "resonance energy", "AKE": "kinetic energy"}
QUANT = {}
for code, desc in q(f"SELECT code, description FROM read_parquet('{L}/exfor/dictionary/quantities/*')"):
    if desc and desc.strip():
        QUANT[code.strip(",").strip()] = desc.strip().strip("()").lower()
si = q(f"""SELECT dataset, entry, target_sym, try_cast(target_za AS INTEGER), projectile, process, reaction, sf6, quantity,
  energy_min_ev, energy_max_ev, year, first_author, institute, title FROM read_parquet('{L}/serve/exfor/2026-10-28/search_index/*')""")
exfor = {}  # dataset -> (text, triple, target_sym)
by_entry = collections.defaultdict(list)
by_triple = collections.defaultdict(list)
by_target = collections.defaultdict(list)
by_rq = collections.defaultdict(list)  # (reaction, sf6) -> datasets
def norm_target(t):
    """EXFOR's FE-56 -> Fe-56; anything else (H-PLE, AM-242-M) as written."""
    m = re.fullmatch(r"([A-Za-z]{1,2})-(\d{1,3})", t or "")
    return f"{UPPER[m.group(1).upper()]}-{int(m.group(2))}" if m and m.group(1).upper() in UPPER else t


for ds, entry, tsym, tza, proj, proc, reac, sf6, quant, emin, emax, year, fa, inst, title in si:
    if not tsym or not reac:
        continue
    tsym = norm_target(tsym)
    qw = QWORDS.get((sf6 or "").strip()) or QUANT.get((sf6 or "").strip()) or (sf6 or "").lower()
    span = " to ".join(x for x in (fmt_e(emin), fmt_e(emax)) if x)
    text = (f"{tsym}({reac}) {qw}: {(title or '').strip()} {fa or ''}, {year or ''}, {inst or ''}"
            + (f", {span}" if span else "")).strip()
    triple = f"{tsym}|{reac}|{sf6 or ''}"
    exfor[ds] = (text, triple, tsym)
    by_entry[entry].append(ds)
    by_triple[triple].append(ds)
    by_target[tsym].append(ds)
    by_rq[(reac, sf6 or "")].append(ds)
log("exfor datasets", len(exfor), "triples", len(by_triple))

# record lines for the nuclide pairs: ENSDF nuclide, ICRP 107, ENDF neutron materials of four libraries, EXFOR targets
records = {}  # id -> (text, (z, a))
for typ, rid, title, z, a in q(f"""SELECT type, id, title, try_cast(z AS INTEGER), try_cast(a AS INTEGER)
  FROM read_parquet('{L}/serve/search/2026-11-08/docs_structure/*')
  WHERE type IN ('nuclide', 'icrp_nuclide') OR (type = 'material' AND (id LIKE 'B-VIII.1/neutrons/%'
     OR id LIKE 'JEFF-3.3/neutrons/%' OR id LIKE 'JENDL-5/neutrons/%' OR id LIKE 'TENDL-2023/neutrons/%'))"""):
    if z is None or a is None or not title or (typ == "icrp_nuclide" and re.search(r"\d+m\d?\b", rid or "")):
        continue
    records[rid] = (title, (z, a))
for tsym, dss in by_target.items():
    m = re.fullmatch(r"([A-Za-z]{1,2})-(\d{1,3})", tsym)
    if not m or m.group(1) not in Z or int(m.group(2)) == 0:
        continue
    top = collections.Counter(exfor[d][1].split("|")[1] for d in dss).most_common(4)
    records[f"exfor-target:{tsym}"] = (f"{tsym}: {len(dss):,} EXFOR datasets; reactions "
                                       + ", ".join(f"({r}) {n}" for r, n in top), (Z[m.group(1)], int(m.group(2))))
rec_by_nuc = collections.defaultdict(list)
for rid, (t, za) in records.items():
    if za[1] > 0:
        rec_by_nuc[za].append(rid)
rec_by_z, rec_by_a = collections.defaultdict(list), collections.defaultdict(list)
for (z, a), rr in rec_by_nuc.items():
    rec_by_z[z].append(((z, a), rr))
    rec_by_a[a].append(((z, a), rr))
log("record lines", len(records), "nuclides with records", len(rec_by_nuc))

pairs = collections.defaultdict(list)  # type -> [dict(unit, query, pos_id, rel_ids)]


def paper_ok(k):
    return k in papers


# ---------- ex_nsr ----------
links = collections.defaultdict(set)
for k, entry in q(f"SELECT key_number, exfor_id FROM read_parquet('{NSR}/public.nsr_exfor/*/*.parquet')"):
    if paper_ok(k):
        links[entry.strip()].add(k)
for entry, keys in links.items():
    dss = by_entry.get(entry, [])
    for ds in rnd.sample(dss, min(2, len(dss))):
        for k in sorted(keys):
            pairs["ex_nsr"].append({"unit": f"entry:{entry}", "query": exfor[ds][0], "pos_id": k, "rel_ids": sorted(keys),
                                    "qid_src": f"exfor:{ds}", "za": None, "entry": entry})
log("ex_nsr", len(pairs["ex_nsr"]))

# ---------- ensdf_nsr ----------
for seq, nucid, dsid, dstype, dsref in q(f"SELECT dataset_seq, nucid, dsid, dstype, dsref FROM read_parquet('{L}/ensdf/2026-11-05/datasets/*') "
                                        "WHERE dsref IS NOT NULL AND dstype NOT IN ('comments', 'references')"):
    nuc = nuc_of(nucid)
    keys = sorted({k.strip() for k in re.split(r"[,\s]+", dsref or "") if re.fullmatch(r"\d{4}[A-Z]{2}[A-Z0-9]{2}", k.strip()) and paper_ok(k.strip())})
    if not nuc or not keys:
        continue
    d = dsid.strip()
    d = d.capitalize() if d.upper().startswith(("ADOPTED", "COMMENTS")) else d
    query = f"{nuc} · {d}"
    for k in keys:
        pairs["ensdf_nsr"].append({"unit": f"ensdf:{seq}", "query": query, "pos_id": k, "rel_ids": keys, "qid_src": f"ensdf:{seq}",
                                   "za": None, "nuc": nuc})
log("ensdf_nsr", len(pairs["ensdf_nsr"]))

# ---------- endf_nsr: (volume, page, year) in MF1/451 matching exactly one NSR key ----------
VPY = re.compile(r"(\d{1,4})\s*,\s*([A-Z]?\d{1,7})\s*\(\s*((?:19|20)\d{2})\s*\)")
vpy = collections.defaultdict(set)
for k, ref in q(f"SELECT key_number, reference FROM read_parquet('{NSR}/public.nsr/*/*.parquet') WHERE reference IS NOT NULL"):
    for m in VPY.finditer(ref):
        vpy[(m.group(1), m.group(2), m.group(3))].add(k)
seen_mat = set()
for rel in ("B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "CENDL-3.2"):
    for zsym, za, mat, lab, auth, desc in q(f"SELECT zsymam, try_cast(za AS DOUBLE), mat, alab, auth, description FROM "
                                            f"read_parquet('{L}/endfb/{rel}/materials/*') WHERE sublibrary LIKE 'neutrons%' "
                                            "AND description IS NOT NULL"):
        if za is None:
            continue
        z, a = divmod(int(za), 1000)
        if z >= len(SYMS) or a == 0:
            continue
        name = f"{SYMS[z]}-{a}"
        hits = sorted({next(iter(vpy[t])) for t in ((m.group(1), m.group(2), m.group(3)) for m in VPY.finditer(desc))
                       if len(vpy.get(t, ())) == 1 and paper_ok(next(iter(vpy[t])))})
        if not hits:
            continue
        query = f"{name} evaluated neutron data, {rel}, MAT {mat}, {(lab or '').strip()}, {(auth or '').strip()}".strip(", ")
        for k in hits:
            if (name, k) in seen_mat:
                continue
            seen_mat.add((name, k))
            pairs["endf_nsr"].append({"unit": f"endf:{name}", "query": query, "pos_id": k, "rel_ids": hits, "qid_src": f"endf:{rel}:{mat}",
                                      "za": (z, a)})
log("endf_nsr", len(pairs["endf_nsr"]))

# ---------- nuclide ----------
for (z, a), rids in rec_by_nuc.items():
    if z >= len(SYMS) or z == 0:
        continue
    s = SYMS[z]
    for form in (f"{s}-{a}", f"{a}{s}", f"{NAME[s]}-{a}"):
        for rid in rnd.sample(rids, min(2, len(rids))):
            pairs["nuclide"].append({"unit": f"nuclide:{z}-{a}", "query": form, "pos_id": rid, "rel_ids": sorted(rids),
                                     "qid_src": f"nuclide:{z}-{a}:{form}", "za": (z, a)})
log("nuclide", len(pairs["nuclide"]))

# ---------- reaction ----------
for triple, dss in by_triple.items():
    tsym, reac, sf6 = triple.split("|")
    m = re.fullmatch(r"([A-Za-z]{1,2})-(\d{1,3})", tsym)
    if not m or m.group(1) not in NAME or "," not in reac:
        continue
    proj, proc = reac.split(",", 1)
    pw = PROJ.get(proj)
    if not pw:
        continue
    procw = PROC.get(proc) or f"({proj.lower()},{proc.lower()})"
    qw = QWORDS.get(sf6) or QUANT.get(sf6) or sf6.lower()
    a = int(m.group(2))
    query = f"{NAME[m.group(1)]}{'' if a == 0 else f'-{a}'} {pw}-induced {procw} {qw}".strip()
    pairs["reaction"].append({"unit": f"reaction:{triple}", "query": query, "pos_id": rnd.choice(dss), "rel_ids": sorted(dss),
                              "qid_src": f"reaction:{triple}", "za": None, "tsym": tsym, "rq": (reac, sf6)})
log("reaction", len(pairs["reaction"]))

# ---------- held-out units ----------
held_keys = {k for k in papers if held(k)}
held_nuc = {za for za in rec_by_nuc if held(f"nuclide:{za[0]}-{za[1]}")}
held_triple = {t for t in by_triple if held(f"reaction:{t}")}
held_units = {p["unit"] for ps in pairs.values() for p in ps if held(p["unit"])}
held_records = {rid for za in held_nuc for rid in rec_by_nuc[za]}
held_ds = {d for t in held_triple for d in by_triple[t]}


def is_held(p, typ):
    """A benchmark query: its unit (EXFOR entry, ENSDF dataset, ENDF nuclide, nuclide, reaction triple) is held out."""
    return p["unit"] in held_units


def trainable(p, typ):
    """Not a benchmark query, and (for the paper types) its positive is not one of nsr-eval-v1's held-out papers."""
    return not is_held(p, typ) and (typ not in ("ex_nsr", "ensdf_nsr", "endf_nsr") or p["pos_id"] not in held_keys)


# ---------- hard negatives ----------
def paper_negs(p, za_list):
    pos = set(p["rel_ids"])
    pool = []
    for za in za_list:
        pool += [k for k in by_nuc.get(za, []) if k not in pos and k not in held_keys]
    pool = list(dict.fromkeys(pool))
    rnd.shuffle(pool)
    out = pool[:5]
    s = papers[p["pos_id"]][2]
    y = papers[p["pos_id"]][1]
    same_author = [k for k in by_author.get(s, []) if k not in pos and k not in held_keys and papers[k][1] != y and k not in out]
    rnd.shuffle(same_author)
    out += same_author[:NEG - len(out)]
    while len(out) < NEG:
        k = rnd.choice(KEYS)
        if k not in pos and k not in held_keys and k not in out:
            out.append(k)
    return out


KEYS = list(papers)
za_of_ds = {}
for ds, (t, tr, tsym) in exfor.items():
    m = re.fullmatch(r"([A-Za-z]{1,2})-(\d{1,3})", tsym)
    za_of_ds[ds] = (Z[m.group(1)], int(m.group(2))) if m and m.group(1) in Z else None
nuc_za = lambda n: (Z[re.sub(r"^\d+", "", n)], int(re.match(r"\d+", n).group())) if n else None  # noqa: E731


def negs_for(p, typ):
    if typ == "ex_nsr":
        ds = p["qid_src"].split(":", 1)[1]
        return [papers[k][0] for k in paper_negs(p, [za_of_ds.get(ds)] if za_of_ds.get(ds) else [])]
    if typ == "ensdf_nsr":
        return [papers[k][0] for k in paper_negs(p, [nuc_za(p["nuc"])])]
    if typ == "endf_nsr":
        return [papers[k][0] for k in paper_negs(p, [p["za"]])]
    if typ == "nuclide":
        z, a = p["za"]
        rel = set(p["rel_ids"])
        same_el = [r for (zz, aa), rr in rec_by_z[z] if aa != a and (zz, aa) not in held_nuc for r in rr]
        same_a = [r for (zz, aa), rr in rec_by_a[a] if zz != z and (zz, aa) not in held_nuc for r in rr]
        rnd.shuffle(same_el)
        rnd.shuffle(same_a)
        out = [r for r in same_el[:4] + same_a[:3] if r not in rel]
        while len(out) < NEG:
            r = rnd.choice(RIDS)
            if r not in rel and r not in held_records:
                out.append(r)
        return [records[r][0] for r in out[:NEG]]
    rel = set(p["rel_ids"])
    same_t = [d for d in by_target[p["tsym"]] if d not in rel and d not in held_ds]
    same_r = [d for d in by_rq[p["rq"]] if d not in rel and d not in held_ds and exfor[d][2] != p["tsym"]]
    rnd.shuffle(same_t)
    rnd.shuffle(same_r)
    out = same_t[:4] + same_r[:NEG - min(4, len(same_t))]
    while len(out) < NEG:
        d = rnd.choice(DSS)
        if d not in rel and d not in held_ds:
            out.append(d)
    return [exfor[d][0] for d in out[:NEG]]


DSS = list(exfor)
RIDS = [r for r in records if records[r][1][1] > 0]


def pos_text(p, typ):
    if typ in ("ex_nsr", "ensdf_nsr", "endf_nsr"):
        return papers[p["pos_id"]][0]
    if typ == "nuclide":
        return records[p["pos_id"]][0]
    return exfor[p["pos_id"]][0]


# ---------- write: training pairs (every non-held-out pair), the training sample, the benchmark ----------
os.makedirs(f"{OUT}/pairs", exist_ok=True)
os.makedirs(f"{OUT}/train", exist_ok=True)
os.makedirs(f"{OUT}/bench", exist_ok=True)
counts, bench_rows, train_rows = {}, [], []
CORPUS = {"ex_nsr": "papers", "ensdf_nsr": "papers", "endf_nsr": "papers", "nuclide": "records", "reaction": "exfor"}
for typ, ps in pairs.items():
    tr = [p for p in ps if trainable(p, typ)]
    hd = [p for p in ps if is_held(p, typ)]
    bench_queries = {}
    for p in hd:  # one benchmark query per distinct query text, relevant = every document the join links to it
        bench_queries.setdefault(p["query"], p)
    bq = list(bench_queries.values())
    rnd.shuffle(bq)
    counts[typ] = {"pairs": len(ps), "train_eligible": len(tr), "held_out_pairs": len(hd), "held_out_queries": len(bq)}
    with open(f"{OUT}/pairs/{typ}.jsonl", "w") as f:
        for p in tr:
            f.write(json.dumps({"type": typ, "query": p["query"], "pos_id": p["pos_id"], "src": p["qid_src"]}) + "\n")
    sample = rnd.sample(tr, min(TRAIN_TARGET[typ], len(tr)))
    for p in sample:
        train_rows.append({"query": p["query"], "pos": [pos_text(p, typ)], "neg": negs_for(p, typ), "type": typ})
    for i, p in enumerate(bq[:BENCH_TARGET[typ]]):
        bench_rows.append({"qid": f"{typ}-{i:05d}", "type": typ, "query": p["query"], "corpus": CORPUS[typ],
                           "relevant": p["rel_ids"], "src": p["qid_src"]})
    counts[typ]["train_sample"] = len(sample)
    counts[typ]["bench"] = min(BENCH_TARGET[typ], len(bq))
    log(typ, counts[typ])
# top the benchmark up to 10,000 from the types with spare held-out queries (endf_nsr is small)
short = 10000 - len(bench_rows)
for typ in ("ex_nsr", "ensdf_nsr", "reaction", "nuclide"):
    if short <= 0:
        break
    have = {r["query"] for r in bench_rows if r["type"] == typ}
    extra = [p for p in {p["query"]: p for p in pairs[typ] if is_held(p, typ)}.values() if p["query"] not in have]
    rnd.shuffle(extra)
    n0 = sum(1 for r in bench_rows if r["type"] == typ)
    for i, p in enumerate(extra[:short]):
        bench_rows.append({"qid": f"{typ}-{n0 + i:05d}", "type": typ, "query": p["query"], "corpus": CORPUS[typ],
                           "relevant": p["rel_ids"], "src": p["qid_src"]})
    took = min(short, len(extra))
    counts[typ]["bench"] += took
    short -= took
rnd.shuffle(train_rows)
with open(f"{OUT}/train/train.jsonl", "w") as f:
    for r in train_rows:
        f.write(json.dumps({"query": r["query"], "pos": r["pos"], "neg": r["neg"]}) + "\n")
with open(f"{OUT}/train/types.jsonl", "w") as f:
    for r in train_rows:
        f.write(json.dumps({"type": r["type"]}) + "\n")
with open(f"{OUT}/bench/queries.jsonl", "w") as f:
    for r in bench_rows:
        f.write(json.dumps(r) + "\n")

# ---------- corpora ----------
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402
os.makedirs(f"{OUT}/corpus", exist_ok=True)
pq.write_table(pa.table({"id": KEYS, "text": [papers[k][0] for k in KEYS], "held_out": [k in held_keys for k in KEYS]}),
               f"{OUT}/corpus/papers.parquet")
pq.write_table(pa.table({"id": DSS, "text": [exfor[d][0] for d in DSS], "triple": [exfor[d][1] for d in DSS]}),
               f"{OUT}/corpus/exfor.parquet")
rids = list(records)
pq.write_table(pa.table({"id": rids, "text": [records[r][0] for r in rids],
                         "nuclide": [f"{records[r][1][0]}-{records[r][1][1]}" for r in rids]}), f"{OUT}/corpus/records.parquet")

manifest = {"model": "nsr-encoder-v2", "brief": 61, "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "seconds": round(time.time() - T0),
            "sources": {"nsr": "lake/nsr-database/2026-10-15/nsr/public.nsr, nsr_exfor, nsr_nuclides",
                        "exfor": "lake/serve/exfor/2026-10-28/search_index; lake/exfor/dictionary/quantities",
                        "ensdf": "lake/ensdf/2026-11-05/datasets (dsref)",
                        "endf": "lake/endfb/{B-VIII.1,B-VIII.0,JEFF-3.3,JENDL-5,CENDL-3.2}/materials (MF1/451 description)",
                        "records": "lake/serve/search/2026-11-08/docs_structure (nuclide, icrp_nuclide, material) + EXFOR targets"},
            "date_cut": {"nsr": "2026-10-15 export", "exfor": "2026-10-28", "ensdf": "2026-11-05", "search_docs": "2026-11-10 build"},
            "holdout": "md5('holdout:' || unit) first hex digit 0-3 (a quarter). Benchmark queries: units entry:<EXFOR "
                       "entry>, ensdf:<dataset>, endf:<nuclide>, nuclide:<z>-<a>, reaction:<target>|<reaction>|<quantity>; "
                       "their relevant documents are every document the join links to them. Training: every other "
                       "query, without nsr-eval-v1's held-out papers (md5('holdout:' || NSR key), the same quarter) as "
                       "positives or negatives, and without benchmark units' records and datasets as negatives",
            "rendering": {
                "paper": "title, two newlines, abstract, first 2,000 characters (nsr-eval-v1's corpus text)",
                "exfor": "<target>(<reaction>) <quantity in words>: <entry title> <first author>, <year>, <institute>, <energy span>",
                "ensdf": "<nuclide> · <DSID> (Adopted and Comments datasets in sentence case)",
                "endf": "<nuclide> evaluated neutron data, <release>, MAT <n>, <lab>, <authors>",
                "nuclide": "Sym-A, ASym and element-A",
                "reaction": "<element>-<A> <projectile>-induced <process> <quantity in words>",
                "records": "the search document's title (ENSDF nuclide, ICRP 107, ENDF neutron material of B-VIII.1, JEFF-3.3, "
                           "JENDL-5 and TENDL-2023) and an EXFOR target line"},
            "negatives": {"papers": "5 sharing a nuclide (nsr_nuclides) not linked to the query, then the positive's first "
                                    "author in another year, then random; 7 a query",
                          "nuclide": "4 record lines of the same element at another A, 3 of the same A in another element",
                          "reaction": "4 datasets of the same target with another reaction or quantity, 3 of the same "
                                      "reaction and quantity on another target"},
            "counts": counts, "train_rows": len(train_rows), "bench_queries": len(bench_rows),
            "corpora": {"papers": len(KEYS), "exfor": len(DSS), "records": len(rids)}}
for d in ("pairs", "train", "bench", "corpus"):
    with open(f"{OUT}/{d}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=1)
for root, _, files in os.walk(OUT):
    for fn in files:
        p = os.path.join(root, fn)
        s3.upload_file(p, BUCKET, f"{PREFIX}/{os.path.relpath(p, OUT)}")
log("uploaded", json.dumps({"counts": counts, "train_rows": len(train_rows), "bench": len(bench_rows),
                            "corpora": manifest["corpora"]}))
