CREATE EXTERNAL TABLE `exfor_c5_datasets` (
  `dataset` string,
  `subent_hdr` string,
  `entry_hdr` string,
  `reaction` string,
  `quantity` string,
  `data_units` string,
  `c4_reaction` string,
  `reaction_type` string,
  `mf_hdr` string,
  `mt_hdr` string,
  `title` string,
  `author1` string,
  `institute` string,
  `x4ref1` string,
  `c5corr` string,
  `year` int,
  `c5data_rows` int,
  `headers` map<string,string>
)
COMMENT 'C5 c5-2023-08-28 datasets'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/c5-2023-08-28/datasets/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
