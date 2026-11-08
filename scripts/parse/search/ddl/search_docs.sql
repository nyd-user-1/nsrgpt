CREATE EXTERNAL TABLE `search_docs` (
  `type` string,
  `id` string,
  `name` string,
  `title` string,
  `text` string,
  `keywords` array<string>,
  `dataset` string,
  `z` int,
  `a` int,
  `mt` int,
  `year` int,
  `url_path` string
)
COMMENT 'Search documents, parsing-2 share (2026-11-08)'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/serve/search/2026-11-08/docs/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
