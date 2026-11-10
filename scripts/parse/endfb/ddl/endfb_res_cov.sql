CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_res_cov` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `isotope_index` int,
  `zai` double,
  `range_index` int,
  `el_ev` double,
  `eh_ev` double,
  `lru` int,
  `lrf` int,
  `lcomp` int,
  `isr` int,
  `dap` double,
  `block` string,
  `block_index` int,
  `lb` int,
  `row_param` int,
  `col_param` int,
  `row_name` string,
  `col_name` string,
  `l` int,
  `j` double,
  `row_er_ev` double,
  `col_er_ev` double,
  `row_value` double,
  `row_energy_ev` double,
  `col_energy_ev` double,
  `value` double,
  `ndigit` int,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/res_cov/';
ALTER TABLE `endfb_res_cov` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/res_cov/';
