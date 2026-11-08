CREATE EXTERNAL TABLE `search_nsr` (
  `key_number` string,
  `year` int,
  `reference` string,
  `authors` string,
  `title` string,
  `doi` string,
  `keywords` string,
  `nuclides` string,
  `reactions` string,
  `reference_type` string,
  `journal_code` string,
  `exfor_keys` string,
  `entry_date` string,
  `modification_date` string
)
COMMENT 'Search serving table nsr'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/search/2026-11-08/nsr/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
