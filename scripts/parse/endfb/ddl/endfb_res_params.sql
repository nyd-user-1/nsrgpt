CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_res_params` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `isotope_index` int,
  `range_index` int,
  `lru` int,
  `lrf` int,
  `unresolved` boolean,
  `group_index` int,
  `res_index` int,
  `l` int,
  `j` double,
  `er_ev` double,
  `gt_ev` double,
  `gn_ev` double,
  `gg_ev` double,
  `gf_ev` double,
  `gfa_ev` double,
  `gfb_ev` double,
  `gx_ev` double,
  `widths` string,
  `es_ev` double,
  `d_ev` double,
  `amun` double,
  `amux` double,
  `amug` double,
  `amuf` double,
  `gn0_ev` double,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/res_params/';
ALTER TABLE `endfb_res_params` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/res_params/';
