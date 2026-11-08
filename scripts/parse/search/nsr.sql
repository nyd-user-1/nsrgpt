-- search_nsr (brief 18): one row per NSR reference, the record /nsr/{key} returns (services/nsr-api/keyword_search.py).
-- From the nsr database export (nsr_parquet), NSR rows only, sorted by key number so a lookup reads one row group.
-- Built with UNLOAD, registered as nsr.search_nsr (scripts/parse/search/unload.py).
UNLOAD (
SELECT key_number, pub_year AS year, reference, authors, title, doi, keywords, nuclides, reactions, reference_type,
       journal_code, exfor_keys, entry_date, modification_date
FROM nsr_parquet WHERE is_nsr ORDER BY key_number
) TO 's3://nsr-lake-613473203863/lake/serve/search/2026-11-08/nsr/'
WITH (format = 'PARQUET', compression = 'SNAPPY')
