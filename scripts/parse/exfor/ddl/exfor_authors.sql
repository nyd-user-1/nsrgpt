CREATE EXTERNAL TABLE `exfor_authors` (
  `entryid` bigint,
  `iref` bigint,
  `iyear` bigint,
  `iauthor` bigint,
  `entry` string,
  `authorini` string,
  `author` string,
  `fullname` string
)
COMMENT 'X4Pro x4sqlite-20230714-c table AUTHORS'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2023-07-14/AUTHORS/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
