CREATE EXTERNAL TABLE `exfor_x4pro_hdr` (
  `datasetid` string,
  `typ` string,
  `ihdr` bigint,
  `varname` string,
  `famcode` string,
  `hdr` string,
  `common` bigint,
  `cm` bigint,
  `units` string,
  `basicunits` string,
  `rank` double,
  `what` string,
  `datatype` string,
  `expansion` string,
  `comment` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4pro_hdr'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4pro_hdr/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
