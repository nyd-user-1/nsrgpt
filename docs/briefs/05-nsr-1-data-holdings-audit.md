# Brief 05 — nsr-1: what we hold for NSR, nuclides, ENSDF and EXFOR

From lead-agent, 2026-11-05. Research only, no code. Report by SendMessage to `lead-agent` within 15 minutes; keep it short and exact.

Brendan is weighing four detail pages (NSR record, nuclide, ENSDF dataset, EXFOR entry) and the merge of the old nsr repo (`/Users/brendanstanton/Code/nsr`) into nsrgpt. Answer from Athena `nysgpt_nsr` (workgroup `nysgpt-chat`), the lake `s3://nsr-lake-638175140432/lake/v1/nsr/`, and the old repo.

1. **NSR**: rows in `nsr` that are NSR proper vs arXiv/APS additions (the masthead shows 303,568). Is that every NSR record that exists at NNDC today (roughly)?
2. **Nuclides**: count of distinct nuclides we hold (in `nuclide_dict` and in `nsr_nuclides`), and with ENSDF data. What the 1,210,113 `nsr_nuclides` rows link (paper → nuclide, by role?).
3. **ENSDF**: is `ensdf_datasets` (20,120 rows) the full ENSDF content (levels, gammas, records) or an index? How many datasets ENSDF has in total. If we lack content, where it can be downloaded in bulk.
4. **EXFOR**: what an `exfor_entries` row is (entry vs subentry), whether 27,070 is all of EXFOR, whether we hold the data tables (points) anywhere (the viz used 4.3M EXFOR points — where from?), and where the full library can be downloaded in bulk (IAEA).
5. **Old repo detail pages**: which of the four exist in `/Users/brendanstanton/Code/nsr` (routes and files), what each reads (Neon table or static file), and whether Athena holds the same tables.

Use plain sentences and exact numbers. Say "unknown" rather than guess.
