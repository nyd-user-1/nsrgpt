CREATE EXTERNAL TABLE `exfor_j4_entries` (
  `entry` string,
  `area` string,
  `date` bigint,
  `alteration_flag` string,
  `transmission_id` string,
  `n_subentries` bigint,
  `institute` array<string>,
  `year` bigint,
  `title` string,
  `authors` array<string>,
  `references` array<string>,
  `status` array<string>,
  `time_stamp` string,
  `file` string
)
COMMENT 'J4 j4-2026-10-28 entries'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/j4-2026-10-28/entries/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
