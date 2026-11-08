CREATE EXTERNAL TABLE `exfor_x25_dictpublkeyno` (
  `publication` string,
  `x4ref` string,
  `keyno` string,
  `doi` string,
  `authors` string,
  `title` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table DictPublKeyNo'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/DictPublKeyNo/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
