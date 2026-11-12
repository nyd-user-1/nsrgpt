# Brief 74 (Elpis lane B): the routes Elpis's book calls, against JANIS Web's own numbers, on a box with its own
# credentials, before a deploy (copied from test_structure.py). httpfs comes from DUCKDB_EXT_DIR.
#   DUCKDB_EXT_DIR=/opt/duckdb_ext /opt/parse/bin/python -I test_janis.py <folder with the nsr-api modules>
# 1. /endf/section/production, gamma + Mn-55 -> Mn-52 (IAEA/PD-2019), against JANIS's computed MF6MT5 table (88 rows,
#    lake/_work/parse/endfb/recon/janis/pages/G_IAEA_PD-2019_DA_DE_Mn55_MT5_calc_MF6MT5/p1.html).
# 2. /endf/xs janis=1 against JANIS's Tabler, where the release's -janis files are served (recon/janis/*.json).
import json
import os
import re
import sys

import boto3

c = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import endf_sections as E  # noqa: E402
import structure as S  # noqa: E402

s3 = boto3.client("s3", region_name="us-east-2")
B, W = "nsr-lake-613473203863", "lake/_work/parse/endfb/recon/janis"
ROW = re.compile(r"<tr><td>([^<]*)</td><td>([^<]*)</td></tr>")


def rel(a, b):
    return abs(a - b) / abs(b) if b else abs(a)


html = s3.get_object(Bucket=B, Key=f"{W}/pages/G_IAEA_PD-2019_DA_DE_Mn55_MT5_calc_MF6MT5/p1.html")["Body"].read().decode()
janis = [(float(a), float(b)) for a, b in ROW.findall(html)]
st, body = E.production({"name": "Mn-55", "sub": "gammas", "zap": "25052", "release": "IAEA-PD-2019"})
s = body["series"][0]
mine = dict(zip(s["energy_ev"], s["xs_barn"]))
d = [rel(mine.get(e, 0.0), x) for e, x in janis if x > 0]
print(json.dumps({"production MF6MT5": {"janis_rows": len(janis), "nonzero": len(d), "max_rel": max(d),
                                         "worst": max(((rel(mine.get(e, 0.0), x), e, x, mine.get(e)) for e, x in janis if x > 0))}}))

for lib, rel_, nuc, name, mt in [("ENDF_B-VIII.0", "B-VIII.0", "Fe56", "Fe-56", 102), ("ENDF_B-VIII.0", "B-VIII.0", "U238", "U-238", 102),
                                 ("JEFF-3.3", "JEFF-3.3", "U235", "U-235", 18), ("JENDL-4.0", "JENDL-4.0", "Pu239", "Pu-239", 18)]:
    try:
        j = json.loads(s3.get_object(Bucket=B, Key=f"{W}/{lib}__{nuc}__MT{mt}.json")["Body"].read())
    except Exception:  # noqa: BLE001
        continue
    st, body = S.xs({"name": name, "mt": str(mt), "release": rel_, "janis": "1"})
    s = body["series"][0]
    if not s.get("release_served", "").endswith("-janis"):
        print(json.dumps({"xs": f"{rel_} {name} MT{mt}", "served": s.get("release_served"), "note": "not served from -janis"}))
        continue
    mine = dict(zip(s["energy_ev"], s["xs_barn"]))
    pairs = [(e, x) for e, x in zip(j["energy_ev"], j["xs_barn"]) if e in mine]
    d = [rel(mine[e], x) for e, x in pairs if x > 0]
    print(json.dumps({"xs": f"{rel_} {name} MT{mt}", "served": s["release_served"], "janis_points": len(j["energy_ev"]),
                      "served_points": len(mine), "thinned": s.get("thinned"), "shared": len(pairs),
                      "max_rel_on_shared": max(d) if d else None}))
