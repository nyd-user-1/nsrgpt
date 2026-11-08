CREATE EXTERNAL TABLE `exfor_x4corr_file` (
  `fileid` bigint,
  `srcfilename` string,
  `mycomment` string,
  `srcfiledate` timestamp,
  `ndatasets` bigint,
  `dbdate` date,
  `src` binary
)
COMMENT 'X4Pro x4sqlite-20230714-c table x4corr_file'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/x4corr_file/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
