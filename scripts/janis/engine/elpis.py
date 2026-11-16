"""Brief 77 step 10: the libraries JANIS has no package for, processed the way NEA processed the packages, for JANIS's
importer. NEA's packages carry each evaluation with its neutron MF3 replaced by NJOY's (resonances reconstructed and
broadened to 293.6 K; scripts/janis/README.md, scripts/recon/README.md); MF1, MF2 and the other files as evaluated, and the
charged-particle and photon sublibraries as evaluated. So, per release:

  prep <rel>     the raw tapes from the lake -> /data/elpis/<rel>/n/<MAT>.endf (one neutron material a file) and
                 /data/elpis/<rel>/other/<sublibrary>.endf (every other sublibrary, as evaluated)
  run <rel> [--jobs N]
                 NJOY2016 per neutron material, lane B's settings (recon.py njoy(): reconr err 0.0005, broadr 293.6 K,
                 errthn 0.001), then the evaluation with its MF3 replaced by NJOY's -> /data/elpis/<rel>/merged/<MAT>.endf;
                 status per material in /data/elpis/<rel>/status/<MAT>.json (a rerun does the rest)
  pack <rel>     merged neutron materials -> /data/elpis/<rel>/tapes/n.endf (+ other/*), the files JANIS imports
  check <rel>    counts: materials, done, failed

Runs on a JANIS engine box (/opt/py/bin/python, NJOY at /opt/njoy/build/njoy), never on the Mac.
"""
import io, json, os, re, subprocess, sys, tarfile, time, zipfile
from concurrent.futures import ThreadPoolExecutor

import boto3

B = "nsr-lake-613473203863"
NJOY = "/opt/njoy/build/njoy"
ROOT = "/data/elpis"
SOURCES = {  # the raw evaluations the lake parsed (lake/endfb/<rel>/manifest.json "source")
    "B-VIII.1": ["raw/nndc/2026-11-07/endf-releases/releases/B-VIII.1/ENDF-B-VIII.1.tar.gz"],
}
NEUTRON_HINTS = ("neutrons/", "/n-", "_n.", "-n.", "n_")
ALL_NEUTRON = {"B-V", "B-IV", "B-III", "B-II"}  # the old ENDF/B tapes hold incident-neutron evaluations only


def s3():
    return boto3.client("s3", region_name="us-east-2")


def sources(rel):
    if rel in SOURCES:
        return SOURCES[rel]
    m = json.loads(s3().get_object(Bucket=B, Key=f"lake/endfb/{rel}/manifest.json")["Body"].read())
    src = m.get("source", {})
    arch = [a["key"] for a in src.get("archives", [])]
    return arch or [src["key"]]


def sublibrary_of(name):
    """'neutrons' for a member that is a neutron sublibrary file, else the member's own sublibrary word."""
    n = name.lower()
    for word in ("neutrons", "protons", "deuterons", "tritons", "helium3s", "he3", "alphas", "gammas", "photo", "decay",
                 "nfy", "sfy", "thermal_scatt", "tsl", "std", "atomic", "electrons", "photoat", "ard", "e-"):
        if word in n:
            return word
    base = os.path.basename(n)
    for k, v in (("_n.", "neutrons"), ("-n.", "neutrons"), ("_p.", "protons"), ("_d.", "deuterons"), ("_t.", "tritons"),
                 ("_h.", "he3"), ("_a.", "alphas"), ("_g.", "gammas")):
        if k in base:
            return v
    return "other"


def materials(lines):
    """Split ENDF-6 lines into materials: {MAT: [lines]} (each up to and including its MEND record)."""
    out, cur, mat = {}, [], None
    for ln in lines:
        if len(ln) < 75:
            continue
        try:
            m = int(ln[66:70])
        except ValueError:
            continue
        if m > 0:
            if mat is None:
                mat = m
            cur.append(ln)
        elif m == 0 and mat is not None:  # MEND
            cur.append(ln)
            out.setdefault(mat, []).extend(cur)
            cur, mat = [], None
    return out


def member_lines(data):
    return data.decode("latin-1").replace("\r", "").split("\n")


def prep(rel):
    d = f"{ROOT}/{rel}"
    os.makedirs(f"{d}/n", exist_ok=True)
    os.makedirs(f"{d}/other", exist_ok=True)
    counts = {}
    for key in sources(rel):
        local = f"{d}/raw/{os.path.basename(key)}"
        os.makedirs(os.path.dirname(local), exist_ok=True)
        if not os.path.exists(local):
            s3().download_file(B, key, local)
        def streams():
            """(member name, a text stream of its lines), one member at a time, never whole in memory."""
            if local.endswith((".tar.gz", ".tgz", ".tar")):
                with tarfile.open(local) as t:
                    for mi in t:
                        if mi.isfile():
                            yield mi.name, io.TextIOWrapper(t.extractfile(mi), encoding="latin-1", newline=None)
            elif local.endswith(".zip"):
                with zipfile.ZipFile(local) as z:
                    for name in z.namelist():
                        if not name.endswith("/"):
                            with z.open(name) as raw:
                                yield name, io.TextIOWrapper(raw, encoding="latin-1", newline=None)
        for name, stream in streams():
            sub = "neutrons" if rel in ALL_NEUTRON else sublibrary_of(key + "/" + name)
            n, cur, mat = 0, [], None
            other = open(f"{d}/other/{sub}.endf", "a", encoding="latin-1") if sub != "neutrons" else None
            for ln in stream:
                ln = ln.rstrip("\n")
                if len(ln) < 75:
                    continue
                try:
                    m = int(ln[66:70])
                except ValueError:
                    continue
                if m > 0:
                    mat = mat or m
                    cur.append(ln)
                elif m == 0 and mat is not None:  # MEND closes the material
                    cur.append(ln)
                    if other is None:
                        with open(f"{d}/n/{mat}.endf", "w", encoding="latin-1") as f:
                            f.write(" " * 66 + "   1 0  0    0\n" + "\n".join(cur) + "\n")
                    else:
                        other.write("\n".join(cur) + "\n")
                    n += 1
                    cur, mat = [], None
            if other:
                other.close()
                if n == 0:
                    os.remove(f"{d}/other/{sub}.endf") if os.path.getsize(f"{d}/other/{sub}.endf") == 0 else None
            counts[sub] = counts.get(sub, 0) + n
    json.dump(counts, open(f"{d}/prep.json", "w"))
    print(rel, counts)


def njoy(wd, mat, timeout=3600):
    inp = (f"reconr\n20 21\n'nsr elpis'/\n{mat} 0/\n0.0005 0. 0 0/\n0/\n"
           f"broadr\n20 21 22\n{mat} 1 0 0 0./\n0.001/\n293.6/\n0/\nstop\n")
    p = subprocess.run([NJOY], cwd=wd, input=inp, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                       errors="replace", timeout=timeout)
    ok = os.path.exists(f"{wd}/tape22") and os.path.getsize(f"{wd}/tape22") > 1000
    if p.returncode != 0 or not ok:
        out = (open(f"{wd}/output", errors="replace").read() if os.path.exists(f"{wd}/output") else "") + p.stdout
        raise RuntimeError("njoy failed\n" + "\n".join(out.splitlines()[-20:]))


def mf_of(ln):
    try:
        return int(ln[70:72])
    except ValueError:
        return -1


def merge(orig, pendf):
    """The evaluation with its MF3 (sections, their SEND records and the FEND after them) replaced by NJOY's."""
    mat_lines = [l for l in orig if len(l) >= 75]
    new3 = [l for l in pendf if len(l) >= 75 and mf_of(l) == 3]
    out, i, placed = [], 0, False
    while i < len(mat_lines):
        l = mat_lines[i]
        mf = mf_of(l)
        if mf == 3:
            j = i
            while j < len(mat_lines) and mf_of(mat_lines[j]) == 3:
                j += 1
            out.extend(new3)
            placed = True
            i = j
            continue
        if not placed and mf > 3 and new3:  # an evaluation with no MF3 of its own: NJOY's goes before MF4
            fend = new3[-1][:66] + new3[-1][66:70] + " 0  0    0"
            out.extend(new3 + [fend])
            placed = True
        out.append(l)
        i += 1
    return out


def one(rel, mat):
    d = f"{ROOT}/{rel}"
    st = f"{d}/status/{mat}.json"
    if os.path.exists(st):
        return json.load(open(st))
    wd = f"/data/tmp/elpis-{rel}-{mat}"
    os.makedirs(wd, exist_ok=True)
    t = time.time()
    res = {"mat": mat}
    try:
        src = open(f"{d}/n/{mat}.endf", encoding="latin-1").read().split("\n")
        open(f"{wd}/tape20", "w", encoding="latin-1").write("\n".join(src) + "\n" + " " * 66 + "  -1 0  0    0\n")
        njoy(wd, mat)
        pendf = open(f"{wd}/tape22", encoding="latin-1").read().split("\n")
        merged = merge([l for l in src[1:] if l.strip()], pendf)
        open(f"{d}/merged/{mat}.endf", "w", encoding="latin-1").write("\n".join(merged) + "\n")
        res.update(ok=True, mf3_lines=sum(1 for l in merged if mf_of(l) == 3))
    except Exception as e:  # noqa: BLE001
        # NJOY refused it: the evaluation goes in as evaluated (its MF3 unprocessed), and the status says so
        res.update(ok=False, error=str(e)[-1200:], evaluated_mf3=True)
        src = open(f"{d}/n/{mat}.endf", encoding="latin-1").read().split("\n")
        open(f"{d}/merged/{mat}.endf", "w", encoding="latin-1").write("\n".join(l for l in src[1:] if l.strip()) + "\n")
    res["seconds"] = round(time.time() - t, 1)
    subprocess.run(["rm", "-rf", wd])
    json.dump(res, open(st, "w"))
    return res


def run(rel, jobs, shard=(0, 1)):
    d = f"{ROOT}/{rel}"
    os.makedirs(f"{d}/merged", exist_ok=True)
    os.makedirs(f"{d}/status", exist_ok=True)
    mats = sorted(int(f[:-5]) for f in os.listdir(f"{d}/n") if f.endswith(".endf"))
    mats = [m for k, m in enumerate(mats) if k % shard[1] == shard[0]]  # --shard i/n: every n-th material from the i-th
    mats.sort(key=lambda m: -os.path.getsize(f"{d}/n/{m}.endf"))
    with ThreadPoolExecutor(jobs) as ex:
        for r in ex.map(lambda m: one(rel, m), mats):
            if not r.get("ok"):
                print("FAILED", rel, r["mat"], (r.get("error") or "")[-200:], flush=True)
    check(rel)


def pack(rel):
    d = f"{ROOT}/{rel}"
    os.makedirs(f"{d}/tapes", exist_ok=True)
    with open(f"{d}/tapes/n.endf", "w", encoding="latin-1") as f:
        f.write(" " * 66 + "   1 0  0    0\n")
        for name in sorted(os.listdir(f"{d}/merged"), key=lambda x: int(x[:-5])):
            f.write(open(f"{d}/merged/{name}", encoding="latin-1").read())
        f.write(" " * 66 + "  -1 0  0    0\n")
    for name in os.listdir(f"{d}/other"):
        with open(f"{d}/tapes/{name}", "w", encoding="latin-1") as f:
            f.write(" " * 66 + "   1 0  0    0\n" + open(f"{d}/other/{name}", encoding="latin-1").read() + " " * 66 + "  -1 0  0    0\n")
    print(rel, sorted(os.listdir(f"{d}/tapes")))


def upload(rel):
    """This box's merged materials, statuses and other sublibraries to the lake (several boxes can share a release)."""
    for sub in ("merged", "status", "other"):
        if os.path.isdir(f"{ROOT}/{rel}/{sub}"):
            subprocess.run(["/snap/bin/aws", "s3", "sync", f"{ROOT}/{rel}/{sub}", f"s3://{B}/lake/_work/janis/engine/elpis/{rel}/{sub}", "--only-show-errors"], check=True)
    check(rel)


def fetch(rel):
    """Every box's merged materials and the other sublibraries from the lake, packed into the tapes JANIS imports."""
    for sub in ("merged", "status", "other"):
        subprocess.run(["/snap/bin/aws", "s3", "sync", f"s3://{B}/lake/_work/janis/engine/elpis/{rel}/{sub}", f"{ROOT}/{rel}/{sub}", "--only-show-errors"], check=True)
    pack(rel)


def check(rel):
    d = f"{ROOT}/{rel}"
    n = len([f for f in os.listdir(f"{d}/n")]) if os.path.isdir(f"{d}/n") else 0
    sts = [json.load(open(f"{d}/status/{f}")) for f in os.listdir(f"{d}/status")] if os.path.isdir(f"{d}/status") else []
    print(json.dumps({"release": rel, "neutron_materials": n, "done": sum(1 for s in sts if s.get("ok")),
                      "failed": sum(1 for s in sts if not s.get("ok")), "prep": json.load(open(f"{d}/prep.json")) if os.path.exists(f"{d}/prep.json") else None}))


if __name__ == "__main__":
    cmd, rel = sys.argv[1], sys.argv[2]
    jobs = int(sys.argv[sys.argv.index("--jobs") + 1]) if "--jobs" in sys.argv else 2
    shard = tuple(int(x) for x in sys.argv[sys.argv.index("--shard") + 1].split("/")) if "--shard" in sys.argv else (0, 1)
    {"prep": lambda: prep(rel), "run": lambda: run(rel, jobs, shard), "fetch": lambda: fetch(rel), "pack": lambda: pack(rel), "upload": lambda: upload(rel), "check": lambda: check(rel)}[cmd]()
