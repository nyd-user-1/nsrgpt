CREATE EXTERNAL TABLE `exfor_alltarget` (
  `id` bigint,
  `target` string,
  `ztarg` bigint
)
COMMENT 'X4Pro x4sqlite-20230714-c table allTarget'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/allTarget/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
