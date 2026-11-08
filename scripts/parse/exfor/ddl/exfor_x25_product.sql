CREATE EXTERNAL TABLE `exfor_x25_product` (
  `subentid` bigint,
  `reacodeid` string,
  `fld` string,
  `zap` bigint,
  `element` bigint,
  `mass` bigint,
  `isomer` string,
  `product` string,
  `prod` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table PRODUCT'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/PRODUCT/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
