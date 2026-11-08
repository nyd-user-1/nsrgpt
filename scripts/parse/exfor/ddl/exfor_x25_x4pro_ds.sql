CREATE EXTERNAL TABLE `exfor_x25_x4pro_ds` (
  `datasetid` string,
  `year1` bigint,
  `nauthors` bigint,
  `author1ini` string,
  `author1` string,
  `ztarg1` bigint,
  `targ1` string,
  `proj` string,
  `proc1` string,
  `mf` bigint,
  `mt` bigint,
  `ndat` bigint,
  `nx` bigint,
  `indvarfam` string,
  `yformula` string,
  `reatyp` string,
  `quant1` string,
  `absentvars` string,
  `reacode` string,
  `compnotes` string
)
COMMENT 'X4Pro x4sqlite-20251105-c table x4pro_ds'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/x4pro-2025-11-05/x4pro_ds/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
