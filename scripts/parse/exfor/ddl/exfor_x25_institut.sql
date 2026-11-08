CREATE EXTERNAL TABLE `exfor_x25_institut` (
  `entryid` bigint,
  `iinstitute` bigint,
  `entry` string,
  `code` string,
  `area` string,
  `country` string,
  `institute` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table INSTITUT'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/INSTITUT/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
