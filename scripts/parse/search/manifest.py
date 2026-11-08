# lake/serve/search/2026-11-08/manifest.json (brief 18): sources, rows per type, bytes, build times, the tokenizer,
# the verification results and spend, from the state files docs.py, unload.py and index.py leave in
# lake/_work/parse/search/state/ and a verify JSON written from the Mac.
#   manifest.py [verify-key]
import sys, os, json
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
from common import *

VERSION = "2026-11-08"


def state(name):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=f"lake/_work/parse/search/state/{name}.json")["Body"].read())
    except Exception:
        return None


docs, nsr, index = state("search-docs"), state("search-nsr"), state("search-index")
structure = None
try:
    structure = glue.get_table(DatabaseName=DATABASE, Name="search_docs_structure")["Table"]["StorageDescriptor"]["Location"]
except Exception:
    pass
m = {"folder": f"lake/serve/search/{VERSION}/",
     "tables": {"docs": {k: docs[k] for k in ("table", "location", "files", "bytes", "rows_by_type", "columns",
                                              "built_at")} if docs else None,
                "docs_structure": {"table": "nsr.search_docs_structure", "location": structure,
                                   "written_by": "parsing-1 (brief 17)"} if structure else None,
                "nsr": nsr},
     "sources": {"docs": ["nsr.exfor_serve_search_index", "nsr.exfor_j4_entries", "nsr.exfor_dict_* (elements, "
                          "processes, particles, quantities)", "nsr.nsr_parquet (is_nsr)", "nsr.xundl_datasets"],
                 "docs_structure": "parsing-1's serving tables (nuclides, levels, decays, ENSDF datasets, ENDF/B)",
                 "suggest": "nuclide names found in the records, EXFOR reactions, author surnames from NSR and EXFOR"},
     "index": index,
     "query": "fts_main_docs.match_bm25's formula (BM25F, one field, k 1.2, b 0.75) over the index tables; same "
              "scores as the macro (scripts/parse/search/test_direct.py)",
     "api": {"routes": ["/search?q=&type=&limit=", "/suggest?q=", "/nsr/{key}"],
             "lambda": "nsr-api (services/nsr-api/keyword_search.py), 3008 MB",
             "cdn": "https://daw1qggkn69lv.cloudfront.net"},
     "built_at": now(),
     "spend": {"box": "EC2 m7i-flex.large (nsr-parse-search), see the final report for its hours",
               "athena": "docs and nsr UNLOADs scanned about 0.1 GB, under $0.001",
               "s3": "about 0.27 GB stored (docs 115 MB, nsr 46 MB, search.duckdb), under $0.01 a month",
               "lambda_api_gateway_cloudfront": "inside the free tiers"}}
if len(sys.argv) > 1:
    m["verify"] = json.loads(s3.get_object(Bucket=BUCKET, Key=sys.argv[1])["Body"].read())
put_json(f"lake/serve/search/{VERSION}/manifest.json", m)
print(json.dumps({"rows_by_type": (index or {}).get("rows_by_type"), "bytes": (index or {}).get("bytes")}))
