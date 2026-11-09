"""ICRP Publication 107 raw files (brief 48, Part A). Runs on the parse box: unpacks what nsr-fetch and the Mac put in
raw/icrp/2026-11-09/, uploads the unpacked files beside their archives, copies the ICRP-07 licence notice into every
folder that holds ICRP-07 data, and writes raw/icrp/2026-11-09/manifest.json (every file: bytes, sha256, source URL,
licence note).
  /opt/parse/bin/python ingest.py"""
import hashlib
import io
import os
import sys
import tarfile
import zipfile
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402

P = "raw/icrp/2026-11-09"
LOCAL = "/data/icrp"
LICENCE = ("ICRP-07 data: copying permitted for educational, research and not-for-profit use with the notice kept "
           "(License_DECDATA.TXT beside the files)")
SUPPL = "P107JAICRP_38_3_Nuclear_Decay_Data_suppl_data.zip"
SUPPL_URL = f"https://journals.sagepub.com/doi/suppl/10.1177/ANIB_38_3/suppl_file/{SUPPL}"
CORR_URL = "https://www.icrp.org/docs/Corrigenda%20of%20Publication%20107.zip"

# Archive key -> (source URL, how it got here, licence)
ARCHIVES = {
    f"{P}/corrigenda-2022/Corrigenda of Publication 107.zip": (CORR_URL, "uploaded from the Mac (Brendan's download, "
                                                               "same bytes as the URL)", LICENCE),
    f"{P}/icrp-org/ICRP-07.zip": ("https://www.icrp.org/docs/ICRP-07.zip", "Lambda nsr-fetch", LICENCE),
    f"{P}/raddata/RadData_1.0.2.tar.gz": ("https://cran.r-project.org/src/contrib/RadData_1.0.2.tar.gz",
                                          "Lambda nsr-fetch; kept for reference beside the CD", "RadData package: GPL-2; its ICRP-07 data keep the ICRP "
                                          "notice (RadData/inst/license.txt)"),
    f"{P}/{SUPPL}": (SUPPL_URL, "Brendan's browser download, uploaded from the Mac", LICENCE),
}
RADDATA_KEEP = ("RadData/DESCRIPTION", "RadData/inst/license.txt", "RadData/data/ICRP_07.NDX.rda",
                "RadData/data/ICRP_07.RAD.rda", "RadData/data/ICRP_07.BET.rda", "RadData/data/rad_codes.rda")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def exists(key):
    try:
        lake.s3.head_object(Bucket=lake.BUCKET, Key=key)
        return True
    except Exception:
        return False


def put(key, body):
    lake.s3.put_object(Bucket=lake.BUCKET, Key=key, Body=body)


def main():
    files, notice = [], None
    for key, (url, via, lic) in ARCHIVES.items():
        if not exists(key):
            continue
        body = open(lake.download(key, os.path.join(LOCAL, key)), "rb").read()
        files.append({"key": key, "bytes": len(body), "sha256": sha(body), "url": url, "via": via, "licence": lic})
        folder = key.rsplit("/", 1)[0]
        members = []
        if key.endswith(SUPPL):
            # The CD keeps its own layout under cd/, its top folder dropped.
            folder = f"{P}/cd"
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                members = [(i.filename.split("/", 1)[1], z.read(i)) for i in z.infolist()
                           if not i.is_dir() and "/" in i.filename and not i.filename.startswith("__MACOSX/")]
        elif key.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                # __MACOSX/._* are the zipping Mac's resource forks, not data.
                members = [(i.filename.rsplit("/", 1)[-1], z.read(i)) for i in z.infolist()
                           if not i.is_dir() and not i.filename.startswith("__MACOSX/")]
        elif key.endswith(".tar.gz"):
            with tarfile.open(fileobj=io.BytesIO(body)) as t:
                members = [(m.name, t.extractfile(m).read()) for m in t.getmembers() if m.name in RADDATA_KEEP]
        with ThreadPoolExecutor(16) as ex:
            list(ex.map(lambda m: put(f"{folder}/{m[0]}", m[1]), members))
        for name, data in members:
            files.append({"key": f"{folder}/{name}", "bytes": len(data), "sha256": sha(data), "url": url,
                          "via": f"unpacked from {key}", "licence": lic})
            if name.endswith("License_DECDATA.TXT"):
                notice = data
    # The notice beside every folder of ICRP-07 data that lacks its own copy.
    for key in list(ARCHIVES):
        folder = key.rsplit("/", 1)[0]
        k = f"{folder}/License_DECDATA.TXT"
        if notice and exists(key) and not any(f["key"] == k for f in files):
            put(k, notice)
            files.append({"key": k, "bytes": len(notice), "sha256": sha(notice), "url": CORR_URL,
                          "via": "copied from corrigenda-2022/License_DECDATA.TXT", "licence": LICENCE})
    have_suppl = exists(f"{P}/{SUPPL}")
    not_taken = [{"url": "ICRP Publication 107 report PDF (Ann. ICRP 38(3))", "why": "page 2: for internal ICRP use only; "
                  "kept out of the lake (brief 48 rule 4)"}]
    if not have_suppl:
        not_taken.insert(0, {"url": SUPPL_URL, "why": "SAGE answers scripts and Lambda nsr-fetch with a Cloudflare "
                             "challenge (403). Its RAD, BET, ACK and NSF files are in no GitHub mirror; RadData's "
                             "R copies of RAD and BET stand in until a browser download arrives"})
    manifest = {
        "source": "ICRP Publication 107, Nuclear Decay Data for Dosimetric Calculations (2008), and its 2022 corrigenda",
        "prefix": P, "built": lake.now(),
        "how": "scripts/parse/icrp107/ingest.py in github.com/nyd-user-1/nsrgpt (Lambda nsr-fetch, the parse box)",
        "licence": LICENCE,
        "ndx_note": "corrigenda-2022/ICRP-07.NDX (2021-12, same bytes as icrp-org/ICRP-07.NDX) supersedes the CD's "
                    "cd/ICRP-07.NDX and is the one parsed; RAD, BET, ACK and NSF are the CD's (cd/)",
        "counts": {"files": len(files), "bytes": sum(f["bytes"] for f in files)},
        "files": files, "not_taken": not_taken,
    }
    lake.put_json(f"{P}/manifest.json", manifest)
    print(f"{len(files)} files, {manifest['counts']['bytes']:,} bytes; suppl zip: {have_suppl}")
    ndx = {f["key"]: f["sha256"] for f in files if f["key"].endswith("ICRP-07.NDX")}
    for k, h in ndx.items():
        print(h[:16], k)


if __name__ == "__main__":
    main()
