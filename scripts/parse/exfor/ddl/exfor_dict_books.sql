CREATE EXTERNAL TABLE `exfor_dict_books` (
  `diction` bigint,
  `code` string,
  `description` string,
  `active` boolean
)
COMMENT 'EXFOR dictionary books'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/dictionary/books/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
