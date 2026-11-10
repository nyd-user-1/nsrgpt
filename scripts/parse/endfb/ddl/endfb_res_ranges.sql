CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_res_ranges` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `za` double,
  `awr` double,
  `nis` int,
  `isotope_index` int,
  `zai` double,
  `abn` double,
  `lfw` int,
  `ner` int,
  `range_index` int,
  `isotope_range` int,
  `el_ev` double,
  `eh_ev` double,
  `lru` int,
  `lrf` int,
  `nro` int,
  `naps` int,
  `spi` double,
  `ap` double,
  `lad` int,
  `nls` int,
  `nlsc` int,
  `lssf` int,
  `ifg` int,
  `krm` int,
  `krl` int,
  `npp` int,
  `njs` int,
  `scattering_radius_only` boolean,
  `n_resonances` int,
  `ap_table` string,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/res_ranges/';
ALTER TABLE `endfb_res_ranges` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/res_ranges/';
