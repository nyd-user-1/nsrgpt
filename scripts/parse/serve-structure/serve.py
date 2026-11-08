"""Brief 17: serving tables for nuclides (ENSDF 2026-11-05), ENDF/B (nine releases) and parsing-1's search documents.
Built in Athena with UNLOAD (workgroup nsrgpt enforces its own output location, so CTAS with a location is refused), then
registered in nsr from the Parquet schema, counted, and written into a manifest per set. Runs on the parse box:
  serve.py nuclide                    summary, levels, gammas, decays     -> lake/serve/nuclide/2026-11-05/<table>/
  serve.py mt                         MT names (ENDF-102, by hand)        -> lake/serve/endf/mt_names/
  serve.py endf [--fresh] [release…]  materials and xs per release        -> lake/serve/endf/<release>/<table>/
  serve.py endf_point <release>…      a POINT release: materials, thinned xs -> lake/serve/endf/<release>/<table>/
  serve.py point_files <release>…     the API's xs_index and xs_series files for a POINT release
  serve.py docs                       search documents (brief 18 shape)   -> lake/serve/search/2026-11-08/docs_structure/
SQL templates are ddl/<table>.sql; the CREATE TABLE statements are saved beside them as ddl/<athena table>.table.sql.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DDL = f"{HERE}/ddl"
B = lake.BUCKET
NUCLIDE = "lake/serve/nuclide/2026-11-05"
ENDF = "lake/serve/endf"
SEARCH = "lake/serve/search/2026-11-08"
WORK = "lake/_work/parse/serve-structure"
RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II"]
TOL_KEV = "0.5"  # floor of the final-level match window for adopted gammas
TMP = "/data/tmp"
os.makedirs(TMP, exist_ok=True)

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
            "Lv livermorium|Ts tennessine|Og oganesson").split("|")
SUBLIBRARY = {0: "gammas", 3: "photoat", 4: "decay", 5: "sfy", 6: "atomic_relax", 10: "neutrons", 11: "nfy",
              12: "thermal_scatt", 19: "standards", 113: "electrons", 10010: "protons", 10020: "deuterons",
              10030: "tritons", 20030: "helium3s", 20040: "alphas"}
PROJECTILE = {"neutrons": "n", "standards": "n", "protons": "p", "deuterons": "d", "tritons": "t", "helium3s": "3He",
              "alphas": "a", "gammas": "g", "photoat": "g", "electrons": "e"}
SUB_WORDS = {"neutrons": "neutron incident-neutron", "standards": "neutron standards", "protons": "proton incident-proton",
             "deuterons": "deuteron incident-deuteron", "tritons": "triton incident-triton",
             "helium3s": "helium-3 incident-helium-3", "alphas": "alpha incident-alpha",
             "gammas": "photonuclear photon incident-photon", "photoat": "photo-atomic photon", "electrons": "electron",
             "decay": "radioactive decay", "nfy": "neutron-induced fission yields", "sfy": "spontaneous fission yields",
             "atomic_relax": "atomic relaxation", "thermal_scatt": "thermal neutron scattering"}


# ---------- SQL macros ----------
def m_hl_s(v, u):
    """Half-life (value, unit) to seconds; level widths (eV, keV, MeV) by T = hbar ln2 / width."""
    f = {"Y": "31556926.0", "D": "86400.0", "H": "3600.0", "M": "60.0", "MIN": "60.0", "S": "1.0", "MS": "1e-3",
         "US": "1e-6", "NS": "1e-9", "PS": "1e-12", "FS": "1e-15", "AS": "1e-18"}
    w = {"EV": "4.562386e-16", "KEV": "4.562386e-19", "MEV": "4.562386e-22"}
    cases = " ".join(f"WHEN '{k}' THEN {v} * {x}" for k, x in f.items())
    cases += " " + " ".join(f"WHEN '{k}' THEN {x} / nullif({v}, 0)" for k, x in w.items())
    return f"(CASE upper({u}) {cases} END)"


def m_modes(x):
    """Continuation fields starting with % (decay branches) -> JSON array of {mode, pct, text}."""
    keys = f"filter(map_keys({x}), k -> starts_with(k, '%'))"
    item = (f"'{{\"mode\":' || json_format(CAST(regexp_replace(k, '%|#[0-9]+$', '') AS JSON)) || ',\"pct\":' || "
            f"coalesce(CAST(try_cast(regexp_extract(element_at({x}, k), '^\\s*([0-9]*\\.?[0-9]+(?:[Ee][+-]?[0-9]+)?)', 1) "
            f"AS double) AS varchar), 'null') || ',\"text\":' || coalesce(json_format(CAST(element_at({x}, k) AS JSON)), "
            f"'null') || '}}'")
    return f"(CASE WHEN cardinality({keys}) = 0 THEN NULL ELSE '[' || array_join(transform({keys}, k -> {item}), ',') || ']' END)"


def m_modes_text(x):
    keys = f"filter(map_keys({x}), k -> starts_with(k, '%'))"
    item = (f"regexp_replace(k, '#[0-9]+$', '') || CASE WHEN regexp_like(coalesce(element_at({x}, k), ''), '^[<>A-Z]') "
            f"THEN ' ' || element_at({x}, k) ELSE '=' || coalesce(element_at({x}, k), '') END")
    return f"nullif(array_join(transform({keys}, k -> {item}), '; '), '')"


def m_sym(x):
    return (f"(CASE WHEN {x} = 'NN' THEN 'n' WHEN regexp_like({x}, '^[0-9]+$') THEN {x} "
            f"ELSE upper(substr({x}, 1, 1)) || lower(substr({x}, 2)) END)")


def m_case(x, mapping, default="NULL"):
    q = lambda v: str(v) if isinstance(v, int) else f"'{v}'"  # noqa: E731
    return f"(CASE {x} " + " ".join(f"WHEN {q(k)} THEN '{v}'" for k, v in mapping.items()) + f" ELSE {default} END)"


def m_mode_words(x):
    parts = [("'%B-%'", "beta-minus"), ("'%EC%'", "electron-capture"), ("'%B+%'", "beta-plus positron"),
             ("'%IT%'", "isomeric-transition"), ("'%SF%'", "spontaneous-fission")]
    out = [f"CASE WHEN {x} LIKE {p} THEN '{w}' END" for p, w in parts]
    out += [f"CASE WHEN regexp_like({x}, '(^|[^A-Z])A($|[^A-Z])') THEN 'alpha' END",
            f"CASE WHEN regexp_like({x}, '(B-|EC|B\\+)[0-9]*N') THEN 'delayed-neutron' END",
            f"CASE WHEN regexp_like({x}, '(EC|B\\+)[0-9]*P') THEN 'delayed-proton' END"]
    return "concat_ws(' ', " + ", ".join(out) + ")"


MACROS = {
    "HL_S": m_hl_s, "MODES": m_modes, "MODES_TEXT": m_modes_text, "SYM": m_sym,
    "CAP": lambda x: f"(upper(substr({x}, 1, 1)) || substr({x}, 2))",
    "ALT": lambda x: f"regexp_replace({x}, '^([0-9]+)([A-Za-z]+)$', '$2-$1')",
    "SUB": lambda x: m_case(x, SUBLIBRARY, "'neutrons'"),
    "PROJ": lambda x: m_case(x, PROJECTILE, "'z'"),
    "SUB_WORDS": lambda x: m_case(x, SUB_WORDS),
    "MODE_WORDS": m_mode_words,
}
CONST = {
    "NUC": "nuc AS (SELECT nucid, max(z) AS z, max(a) AS a, max(" + m_sym("element") + ") AS sym FROM ensdf_datasets "
           "WHERE z IS NOT NULL AND a IS NOT NULL GROUP BY nucid)",
    "ADOPTED": "adopted AS (SELECT nucid, min(dataset_seq) AS dataset_seq FROM ensdf_datasets "
               "WHERE dstype = 'adopted' AND z IS NOT NULL GROUP BY nucid)",
    "ELEMENTS": "(VALUES " + ", ".join(f"({z}, '{e.split()[0]}', '{e.split()[1]}')" for z, e in enumerate(ELEMENTS))
                + ") AS el(z, sym, ename)",
    "TOL": TOL_KEV,
}


def render(name, **kw):
    sql = "\n".join(ln for ln in open(f"{DDL}/{name}.sql").read().splitlines() if not ln.startswith("--")).strip()
    for k, v in {**CONST, **kw}.items():
        sql = sql.replace(f"@{k}@", v)

    def call(m):
        args = [a.strip() for a in m.group(2).split(",")]
        return MACROS[m.group(1)](*args)
    sql = re.sub(r"@(\w+)\(([^@]*)\)@", call, sql)
    left = re.findall(r"@\w+@", sql)
    assert not left, left
    return sql


# ---------- Athena: UNLOAD, register, count ----------
def athena_type(t):  # copied from scripts/parse/exfor/common.py (parsing-2)
    if pa.types.is_int8(t) or pa.types.is_int16(t):
        return "smallint" if pa.types.is_int16(t) else "tinyint"
    if pa.types.is_int32(t) or pa.types.is_uint16(t) or pa.types.is_uint8(t):
        return "int"
    if pa.types.is_integer(t):
        return "bigint"
    if pa.types.is_float32(t):
        return "float"
    if pa.types.is_floating(t):
        return "double"
    if pa.types.is_boolean(t):
        return "boolean"
    if pa.types.is_string(t) or pa.types.is_large_string(t):
        return "string"
    if pa.types.is_binary(t) or pa.types.is_large_binary(t):
        return "binary"
    if pa.types.is_date(t):
        return "date"
    if pa.types.is_timestamp(t):
        return "timestamp"
    if pa.types.is_decimal(t):
        return f"decimal({t.precision},{t.scale})"
    if pa.types.is_list(t) or pa.types.is_large_list(t):
        return f"array<{athena_type(t.value_type)}>"
    if pa.types.is_struct(t):
        return "struct<" + ",".join(f"{f.name}:{athena_type(f.type)}" for f in t) + ">"
    if pa.types.is_map(t):
        return f"map<{athena_type(t.key_type)},{athena_type(t.item_type)}>"
    raise ValueError(f"no Athena type for {t}")


def objects(prefix):
    return [o for p in lake.s3.get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=prefix)
            for o in p.get("Contents", [])]


def clear(prefix):
    keys = [{"Key": o["Key"]} for o in objects(prefix)]
    for i in range(0, len(keys), 1000):
        lake.s3.delete_objects(Bucket=B, Delete={"Objects": keys[i:i + 1000]})


def unload(template, prefix, **kw):
    prefix = prefix.rstrip("/") + "/"
    clear(prefix)
    _, scanned = lake.query(render(template, LOC=f"s3://{B}/{prefix}", **kw))
    objs = objects(prefix)
    first = f"{TMP}/{template}.parquet"
    lake.s3.download_file(B, min(objs, key=lambda o: o["Size"])["Key"], first)
    return pq.read_schema(first), objs, scanned


def register(table, schema, location, comment, partition=None, drop=True):
    """Create the external table (partitioned by release when `partition` is a release), add the partition, count."""
    cols = ",\n".join(f"  `{f.name}` {athena_type(f.type)}" for f in schema if not (partition and f.name == "release"))
    part = "\nPARTITIONED BY (`release` string)" if partition else ""
    root = f"s3://{B}/{ENDF}/" if partition else f"s3://{B}/{location.rstrip('/')}/"
    sql = (f"CREATE EXTERNAL TABLE{'' if drop else ' IF NOT EXISTS'} `{table}` (\n{cols}\n)\nCOMMENT '{comment}'{part}\n"
           f"STORED AS PARQUET\nLOCATION '{root}'\nTBLPROPERTIES ('parquet.compression'='SNAPPY')")
    if drop:
        lake.query(f"DROP TABLE IF EXISTS `{table}`")
    lake.query(sql)
    path = f"{DDL}/{table}.table.sql"
    adds = []
    if partition:
        add = (f"ALTER TABLE `{table}` ADD IF NOT EXISTS PARTITION (release='{partition}') "
               f"LOCATION 's3://{B}/{location.rstrip('/')}/'")
        lake.query(add)
        if not drop and os.path.exists(path):
            adds = [ln.rstrip(";\n") for ln in open(path) if ln.startswith("ALTER TABLE")]
        adds = list(dict.fromkeys(adds + [add]))
    with open(path, "w") as f:
        f.write(sql + ";\n" + "".join(a + ";\n" for a in adds))
    lake.s3.upload_file(path, B, f"{WORK}/ddl/{table}.table.sql")
    where = f" WHERE release = '{partition}'" if partition else ""
    out, scanned = lake.rows(f'SELECT count(*) FROM "{table}"{where}')
    return int(out[0][0]), scanned


def build(template, table, prefix, comment, partition=None, drop=True, **kw):
    schema, objs, scanned = unload(template, prefix, **kw)
    n, s2 = register(table, schema, prefix, comment, partition, drop)
    r = {"athena_table": f"nsr.{table}", "location": f"s3://{B}/{prefix.rstrip('/')}/", "rows": n,
         "bytes": sum(o["Size"] for o in objs), "files": len(objs),
         "columns": [f"{f.name} {athena_type(f.type)}" for f in schema], "sql": f"scripts/parse/serve-structure/ddl/{template}.sql",
         "unload_scanned_bytes": scanned}
    print(table, partition or "", n, r["bytes"], scanned, flush=True)
    return r


def manifest(key, base, tables):
    try:
        m = json.loads(lake.s3.get_object(Bucket=B, Key=key)["Body"].read())
    except lake.s3.exceptions.NoSuchKey:
        m = base
    m.setdefault("tables", {}).update(tables)
    scanned = sum(t.get("unload_scanned_bytes") or 0 for t in m["tables"].values())
    m["built_at"] = lake.now()
    m["spend"] = {"athena_scanned_bytes": scanned, "athena_usd": round(scanned / 1e12 * 5, 4),
                  "box": "nsr-parse-1, m7i-flex.large, about $0.10 an hour on-demand (Free plan credits)"}
    lake.put_json(key, m)
    return m


# ---------- sets ----------
def nuclide():
    t = {}
    for name, comment in [("summary", "One row per nuclide ENSDF knows"), ("levels", "Adopted levels"),
                          ("gammas", "Adopted gammas with resolved final levels"), ("decays", "One row per decay dataset")]:
        t[name] = build(f"nuclide_{name}", f"nuclide_serve_{name}", f"{NUCLIDE}/{name}", f"{comment} (ENSDF 2026-11-05)")
    g, _ = lake.rows("SELECT count(*), count(final_level_seq), count(level_energy_kev) FROM nuclide_serve_gammas")
    t["gammas"]["final_level_resolved"] = {"gammas": int(g[0][0]), "resolved": int(g[0][1]),
                                           "with_initial_level_energy": int(g[0][2]), "tolerance_floor_kev": float(TOL_KEV)}
    manifest(f"{NUCLIDE}/manifest.json", {
        "set": "nuclide", "version": "2026-11-05", "sources": ["nsr.ensdf_* (ENSDF 2026-11-05)", "nsr.xundl_datasets"],
        "notes": ["ENSDF carries no mass excess; summary carries the adopted Q record (Q-, SN, SP, QA) instead.",
                  "Half-lives are converted to seconds with 1 y = 31,556,926 s; level widths with T = hbar ln2 / width."]},
        t)
    print(json.dumps(t["gammas"]["final_level_resolved"]))


MT_SINGLE = {
    1: ("(z,total)", "total"), 2: ("(z,z0)", "elastic scattering"), 3: ("(z,nonelas)", "nonelastic"),
    4: ("(z,n')", "inelastic scattering, all levels"), 5: ("(z,anything)", "sum of reactions not given separately"),
    10: ("(z,contin)", "total continuum reaction"), 11: ("(z,2nd)", "(z,2nd)"), 16: ("(z,2n)", "(z,2n)"),
    17: ("(z,3n)", "(z,3n)"), 18: ("(z,f)", "fission"), 19: ("(z,f)", "first-chance fission"),
    20: ("(z,nf)", "second-chance fission"), 21: ("(z,2nf)", "third-chance fission"), 22: ("(z,na)", "(z,na)"),
    23: ("(z,n3a)", "(z,n3a)"), 24: ("(z,2na)", "(z,2na)"), 25: ("(z,3na)", "(z,3na)"), 27: ("(z,abs)", "absorption"),
    28: ("(z,np)", "(z,np)"), 29: ("(z,n2a)", "(z,n2a)"), 30: ("(z,2n2a)", "(z,2n2a)"), 32: ("(z,nd)", "(z,nd)"),
    33: ("(z,nt)", "(z,nt)"), 34: ("(z,n3He)", "(z,n3He)"), 35: ("(z,nd2a)", "(z,nd2a)"), 36: ("(z,nt2a)", "(z,nt2a)"),
    37: ("(z,4n)", "(z,4n)"), 38: ("(z,3nf)", "fourth-chance fission"), 41: ("(z,2np)", "(z,2np)"),
    42: ("(z,3np)", "(z,3np)"), 44: ("(z,n2p)", "(z,n2p)"), 45: ("(z,npa)", "(z,npa)"),
    50: ("(z,n0)", "neutron emission to the ground state"), 91: ("(z,nc)", "inelastic scattering, continuum"),
    101: ("(z,disap)", "disappearance (no outgoing neutron)"), 102: ("(z,g)", "radiative capture"),
    103: ("(z,p)", "(z,p)"), 104: ("(z,d)", "(z,d)"), 105: ("(z,t)", "(z,t)"), 106: ("(z,3He)", "(z,3He)"),
    107: ("(z,a)", "(z,a)"), 108: ("(z,2a)", "(z,2a)"), 109: ("(z,3a)", "(z,3a)"), 111: ("(z,2p)", "(z,2p)"),
    112: ("(z,pa)", "(z,pa)"), 113: ("(z,t2a)", "(z,t2a)"), 114: ("(z,d2a)", "(z,d2a)"), 115: ("(z,pd)", "(z,pd)"),
    116: ("(z,pt)", "(z,pt)"), 117: ("(z,da)", "(z,da)"), 151: ("(z,res)", "resonance parameters"),
    201: ("(z,Xn)", "neutron production"), 202: ("(z,Xg)", "photon production"), 203: ("(z,Xp)", "proton production"),
    204: ("(z,Xd)", "deuteron production"), 205: ("(z,Xt)", "triton production"),
    206: ("(z,X3He)", "helium-3 production"), 207: ("(z,Xa)", "alpha production"), 208: ("(z,Xpi+)", "pi+ production"),
    209: ("(z,Xpi0)", "pi0 production"), 210: ("(z,Xpi-)", "pi- production"),
    251: (None, "average cosine of the elastic scattering angle (mu-bar)"),
    252: (None, "average logarithmic energy decrement (xi)"),
    253: (None, "average square of the logarithmic energy decrement over 2 xi (gamma)"),
}
_MULTI = ("5n 6n 2nt ta 4np 3nd nda 2npa 7n 8n 5np 6np 7np 4na 5na 6na 7na 4nd 5nd 6nd 3nt 4nt 5nt 6nt 2n3He 3n3He "
          "4n3He 3n2p 3n2a 3npa dt npd npt ndt np3He nd3He nt3He nta 2n2p p3He d3He 3Hea 4n2p 4n2a 4npa 3p n3p 3n2pa "
          "5n2p").split()
for _i, _r in enumerate(_MULTI):
    MT_SINGLE[152 + _i] = (f"(z,{_r})", f"(z,{_r})")
_LEVELS = [(51, 90, "n", "neutron"), (600, 648, "p", "proton"), (650, 698, "d", "deuteron"), (700, 748, "t", "triton"),
           (750, 798, "3He", "helium-3"), (800, 848, "a", "alpha"), (875, 890, "2n", "two-neutron")]


def mt_entry(mt):
    if mt in MT_SINGLE:
        r, n = MT_SINGLE[mt]
        return r, n, f"{n}; ENDF-102 MT {mt}"
    for lo, hi, p, word in _LEVELS:
        base = lo - 1 if p == "n" else lo  # MT 51 is the first excited state; MT 600 is the ground state
        if lo <= mt <= hi:
            k = mt - base if p == "n" else mt - lo
            return f"(z,{p}{k})", f"{word} emission to level {k}", f"{word} emission leaving the residual in excited state {k}" \
                if k else f"{word} emission leaving the residual in its ground state"
    for c, p, word in [(649, "p", "proton"), (699, "d", "deuteron"), (749, "t", "triton"), (799, "3He", "helium-3"),
                       (849, "a", "alpha"), (891, "2n", "two-neutron")]:
        if mt == c:
            return f"(z,{p}c)", f"{word} emission, continuum", f"{word} emission to the continuum"
    return None, f"MT {mt}", f"MT {mt}: an older reaction number outside the ENDF-6 list in ENDF-102"


def mt():
    rows, _ = lake.rows("SELECT DISTINCT mt FROM endfb_sections WHERE mf = 3 ORDER BY mt")
    mts = [int(r[0]) for r in rows]
    tab = pa.table({"mt": pa.array(mts, pa.int32()),
                    "reaction": [mt_entry(m)[0] for m in mts], "name": [mt_entry(m)[1] for m in mts],
                    "description": [mt_entry(m)[2] for m in mts]})
    prefix = f"{ENDF}/mt_names/"
    clear(prefix)
    pq.write_table(tab, f"{TMP}/mt_names.parquet", compression="snappy")
    lake.s3.upload_file(f"{TMP}/mt_names.parquet", B, prefix + "part-00000.parquet")
    n, _ = register("endf_serve_mt_names", tab.schema, prefix, "ENDF MT numbers present in MF3, named from ENDF-102")
    r = {"athena_table": "nsr.endf_serve_mt_names", "location": f"s3://{B}/{prefix}", "rows": n,
         "bytes": os.path.getsize(f"{TMP}/mt_names.parquet"), "files": 1,
         "columns": [f"{f.name} {athena_type(f.type)}" for f in tab.schema],
         "source": "written by hand in scripts/parse/serve-structure/serve.py from ENDF-102 Appendix B"}
    manifest(f"{ENDF}/manifest.json", {"set": "endf", "sources": ["nsr.endfb_* (nine ENDF/B releases)"]},
             {"mt_names": r})
    print("mt_names", n)


def endf(releases, fresh):
    t = {}
    for i, rel in enumerate(releases):
        drop = fresh and i == 0
        t[f"materials/{rel}"] = build("endf_materials", "endf_serve_materials", f"{ENDF}/{rel}/materials",
                                      "ENDF/B materials, one row each", partition=rel, drop=drop, R=rel)
        t[f"xs/{rel}"] = build("endf_xs", "endf_serve_xs", f"{ENDF}/{rel}/xs",
                               "ENDF/B MF3 cross sections as point arrays, one row each", partition=rel, drop=drop, R=rel)
    manifest(f"{ENDF}/manifest.json", {"set": "endf", "sources": ["nsr.endfb_* (nine ENDF/B releases)"]}, t)


POINT_STEPS = 20000  # log-energy steps for thinning a POINT section; a thinned row keeps at most 2 per step
POINT_MAX = 2 * POINT_STEPS  # sections with more points than this are thinned


def endf_point(rel):
    """A POINT release (NNDC's reconstructed, linearized MF3; parsed into endfb_* by scripts/parse/endfb/parse.py, whose
    local output must still be on the box): materials by UNLOAD as for any release; xs built here with DuckDB from the
    parsed points (the local parse output when it is still on the box, else nsr.endfb_xs_points in S3), every section
    with more than POINT_MAX points thinned to the lowest and highest point in each of POINT_STEPS equal steps of log
    energy plus both ends (so resonance peaks and dips stay), written in row groups of 32
    rows so the API reads only the rows it asks for. Every point stays in nsr.endfb_xs_points."""
    import duckdb
    t = {f"materials/{rel}": build("endf_materials", "endf_serve_materials", f"{ENDF}/{rel}/materials",
                                   "ENDF/B materials, one row each", partition=rel, drop=False, R=rel)}
    out = f"/data/endfb/{rel}/out"
    mdir = f"{TMP}/mat-{rel}"
    os.makedirs(mdir, exist_ok=True)
    for f in os.listdir(mdir):
        os.remove(os.path.join(mdir, f))
    for o in objects(f"{ENDF}/{rel}/materials/"):
        lake.s3.download_file(B, o["Key"], f"{mdir}/{o['Key'].rsplit('/', 1)[-1]}")
    xdir = f"{TMP}/xs-{rel}"
    os.makedirs(xdir, exist_ok=True)
    for f in os.listdir(xdir):
        os.remove(os.path.join(xdir, f))
    half = POINT_STEPS
    c = duckdb.connect(config={"temp_directory": f"{TMP}/duckdb", "memory_limit": "5GB", "threads": 2,
                               "extension_directory": "/opt/duckdb_ext"})
    if os.path.isdir(f"{out}/xs_points"):
        xs_src, sec_src = f"{out}/xs_points/*.parquet", f"{out}/sections/*.parquet"
    else:
        cr = lake.boto3.Session().get_credentials().get_frozen_credentials()
        c.execute("INSTALL httpfs")
        c.execute("LOAD httpfs")
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', "
                  f"SESSION_TOKEN '{cr.token}', REGION 'us-east-2')")
        xs_src, sec_src = (f"s3://{B}/lake/endfb/{rel}/xs_points/*.parquet", f"s3://{B}/lake/endfb/{rel}/sections/*.parquet")
    c.execute(f"""
COPY (
WITH m AS (SELECT file_name, mat, sublibrary, name, z, a, liso, za FROM read_parquet('{mdir}/*')),
p AS (SELECT file_name, mat, mt, point_seq, energy_ev, xs_barn, interpolation_region, interpolation
      FROM read_parquet('{xs_src}')),
sec AS (SELECT file_name, mat, mt, qm, qi, lr FROM read_parquet('{sec_src}') WHERE mf = 3),
s AS (SELECT file_name, mat, mt, count(*) AS n, min(energy_ev) AS e0, max(energy_ev) AS e1,
             count(DISTINCT interpolation_region) AS n_reg, max(interpolation) AS law
      FROM p GROUP BY ALL),
big AS (SELECT p.file_name, p.mat, p.mt, p.point_seq, p.xs_barn,
               least(CAST(floor((ln(greatest(p.energy_ev, 1e-30)) - ln(greatest(s.e0, 1e-30)))
                     / greatest(ln(greatest(s.e1, 1e-30)) - ln(greatest(s.e0, 1e-30)), 1e-12) * {half}) AS BIGINT),
                     {half - 1}) AS bucket
        FROM p JOIN s USING (file_name, mat, mt) WHERE s.n > {POINT_MAX}),
pick AS (SELECT file_name, mat, mt, arg_min(point_seq, xs_barn) AS lo, arg_max(point_seq, xs_barn) AS hi
         FROM big GROUP BY file_name, mat, mt, bucket),
keep AS (SELECT file_name, mat, mt, lo AS point_seq FROM pick
         UNION SELECT file_name, mat, mt, hi FROM pick
         UNION SELECT file_name, mat, mt, 1 FROM s WHERE n > {POINT_MAX}
         UNION SELECT file_name, mat, mt, n FROM s WHERE n > {POINT_MAX}),
kept AS (SELECT p.* FROM p JOIN s USING (file_name, mat, mt) WHERE s.n <= {POINT_MAX}
         UNION ALL
         SELECT p.* FROM p SEMI JOIN keep USING (file_name, mat, mt, point_seq)),
reg AS (SELECT file_name, mat, mt, interpolation_region, max(point_seq) AS nbt, max(interpolation) AS law
        FROM p GROUP BY ALL),
interp AS (SELECT file_name, mat, mt, list(CAST(nbt AS INTEGER) ORDER BY interpolation_region) AS interp_nbt,
                  list(CAST(law AS INTEGER) ORDER BY interpolation_region) AS interp_law FROM reg GROUP BY ALL),
agg AS (SELECT file_name, mat, mt, count(*) AS n_served, list(energy_ev ORDER BY point_seq) AS energy_ev,
               list(xs_barn ORDER BY point_seq) AS xs_barn FROM kept GROUP BY ALL)
SELECT '{rel}' AS release, m.sublibrary, m.name, CAST(m.z AS INTEGER) AS z, CAST(m.a AS INTEGER) AS a,
       CAST(m.liso AS INTEGER) AS liso, CAST(m.za AS DOUBLE) AS za, CAST(m.mat AS INTEGER) AS mat,
       CAST(agg.mt AS INTEGER) AS mt, CAST(s.n AS BIGINT) AS n_points, s.e0 AS e_min, s.e1 AS e_max,
       CASE WHEN s.n <= {POINT_MAX} THEN i.interp_nbt WHEN s.n_reg = 1 THEN [CAST(agg.n_served AS INTEGER)] END AS interp_nbt,
       CASE WHEN s.n <= {POINT_MAX} THEN i.interp_law WHEN s.n_reg = 1 THEN [CAST(s.law AS INTEGER)] END AS interp_law,
       CAST(sec.qm AS DOUBLE) AS qm, CAST(sec.qi AS DOUBLE) AS qi, CAST(sec.lr AS INTEGER) AS lr,
       agg.energy_ev, agg.xs_barn, CAST(agg.n_served AS BIGINT) AS n_served, s.n > {POINT_MAX} AS thinned
FROM agg JOIN s USING (file_name, mat, mt) JOIN interp i USING (file_name, mat, mt)
JOIN sec USING (file_name, mat, mt) JOIN m USING (file_name, mat)
ORDER BY m.sublibrary, m.z, m.a, m.liso, agg.mt
) TO '{xdir}/part-00000.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 32)""")
    prefix = f"{ENDF}/{rel}/xs/"
    clear(prefix)
    lake.sync(xdir, prefix)
    schema = pq.read_schema(f"{xdir}/part-00000.parquet")
    n, _ = register("endf_serve_xs", schema, prefix, "ENDF/B MF3 cross sections as point arrays, one row each",
                    partition=rel, drop=False)
    thin = c.execute(f"SELECT count(*), count_if(thinned), sum(n_points), sum(n_served) FROM "
                     f"read_parquet('{xdir}/part-00000.parquet')").fetchone()
    t[f"xs/{rel}"] = {"athena_table": "nsr.endf_serve_xs", "location": f"s3://{B}/{prefix}", "rows": n,
                      "bytes": os.path.getsize(f"{xdir}/part-00000.parquet"), "files": 1,
                      "columns": [f"{f.name} {athena_type(f.type)}" for f in schema],
                      "built_with": f"DuckDB on the box from the parsed points; sections over {POINT_MAX} points thinned "
                                    f"to the lowest and highest point in each of {POINT_STEPS} log-energy steps",
                      "thinned_sections": int(thin[1]), "points": int(thin[2]), "points_served": int(thin[3])}
    print("endf_serve_xs", rel, n, thin, flush=True)
    manifest(f"{ENDF}/manifest.json", {"set": "endf", "sources": ["nsr.endfb_* (nine ENDF/B releases)"]}, t)
    point_files(rel)


def point_files(rel):
    """Two files for the API beside a POINT release's xs table (not registered; nsr.endf_serve_xs holds the same rows):
    xs_index/part-00000.parquet (every column but the arrays, plus sid and the section's byte_offset and n_bytes; the API
    holds it in memory) and xs_series/series.bin (each section's energy then cross-section values as little-endian
    float64, in sid order), so one chart read is a single S3 byte-range request."""
    import array
    import duckdb
    cr = lake.boto3.Session().get_credentials().get_frozen_credentials()
    c = duckdb.connect(config={"temp_directory": f"{TMP}/duckdb", "memory_limit": "5GB", "extension_directory": "/opt/duckdb_ext"})
    c.execute("INSTALL httpfs")
    c.execute("LOAD httpfs")
    c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', SESSION_TOKEN '{cr.token}', "
              "REGION 'us-east-2')")
    c.execute(f"CREATE TABLE x AS SELECT CAST(row_number() OVER (ORDER BY sublibrary, z, a, liso, mt, mat) AS INTEGER) AS sid, * "
              f"FROM read_parquet('s3://{B}/{ENDF}/{rel}/xs/*')")
    sdir, idir = f"{TMP}/xs_series-{rel}", f"{TMP}/xs_index-{rel}"
    for d in (sdir, idir):
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
    sids, offs, sizes, pos = [], [], [], 0
    cur = c.cursor().execute("SELECT sid, energy_ev, xs_barn FROM x ORDER BY sid")
    with open(f"{sdir}/series.bin", "wb") as fh:
        while True:
            batch = cur.fetchmany(500)
            if not batch:
                break
            for sid, e, xv in batch:
                b = array.array("d", e).tobytes() + array.array("d", xv).tobytes()
                fh.write(b)
                sids.append(sid); offs.append(pos); sizes.append(len(b))
                pos += len(b)
    off = pa.table({"sid": pa.array(sids, pa.int32()), "byte_offset": pa.array(offs, pa.int64()),
                    "n_bytes": pa.array(sizes, pa.int64())})
    c.register("off", off)
    c.execute(f"COPY (SELECT x.* EXCLUDE (energy_ev, xs_barn), off.byte_offset, off.n_bytes FROM x JOIN off USING (sid) "
              f"ORDER BY sid) TO '{idir}/part-00000.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)")
    out = {}
    for name, d in [("xs_index", idir), ("xs_series", sdir)]:
        clear(f"{ENDF}/{rel}/{name}/")
        lake.sync(d, f"{ENDF}/{rel}/{name}/")
        out[name] = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
    print("point_files", rel, out, flush=True)
    manifest(f"{ENDF}/manifest.json", {"set": "endf"}, {f"api_files/{rel}": {
        "location": f"s3://{B}/{ENDF}/{rel}/", "files": out,
        "note": "xs_index and xs_series/series.bin: the same rows as nsr.endf_serve_xs for this release, split for the API"}})


def docs():
    t = {"docs_structure": build("docs_structure", "search_docs_structure", f"{SEARCH}/docs_structure",
                                 "Search documents from ENSDF, XUNDL and ENDF/B (parsing-1, brief 17)")}
    by, _ = lake.rows("SELECT type, count(*) FROM search_docs_structure GROUP BY type ORDER BY 2 DESC")
    t["docs_structure"]["rows_by_type"] = {k: int(v) for k, v in by}
    lake.put_json(f"{SEARCH}/docs_structure.manifest.json", {
        "set": "search docs (structure and ENDF share)", "version": "2026-11-08", "built_at": lake.now(),
        "sources": ["nsr.nuclide_serve_*", "nsr.endf_serve_*", "nsr.ensdf_datasets", "nsr.xundl_datasets"],
        "columns_for": "brief 18 (parsing-2's search index reads this beside its own docs)", "tables": t,
        "spend": {"athena_scanned_bytes": t["docs_structure"]["unload_scanned_bytes"],
                  "athena_usd": round(t["docs_structure"]["unload_scanned_bytes"] / 1e12 * 5, 4)}})
    print(json.dumps(t["docs_structure"]["rows_by_type"]))


if __name__ == "__main__":
    step, rest = sys.argv[1], sys.argv[2:]
    if step == "nuclide":
        nuclide()
    elif step == "mt":
        mt()
    elif step == "endf":
        endf([r for r in rest if not r.startswith("--")] or RELEASES, "--fresh" in rest)
    elif step == "endf_point":
        for r in rest:
            endf_point(r)
    elif step == "point_files":
        for r in rest:
            point_files(r)
    elif step == "docs":
        docs()
    elif step == "render":  # print a rendered template, for checking
        print(render(rest[0], LOC="s3://example/", R=rest[1] if len(rest) > 1 else "B-VIII.1"))
    else:
        raise SystemExit(__doc__)
