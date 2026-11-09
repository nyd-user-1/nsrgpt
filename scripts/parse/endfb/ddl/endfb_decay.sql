CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_decay` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `za` double,
  `awr` double,
  `lis` int,
  `liso` int,
  `half_life_s` double,
  `half_life_unc` double,
  `stable` boolean,
  `nsp` int,
  `spin` double,
  `parity` double,
  `mean_light_ev` double,
  `mean_light_unc` double,
  `mean_em_ev` double,
  `mean_em_unc` double,
  `mean_heavy_ev` double,
  `mean_heavy_unc` double,
  `nc` int,
  `mean_energies` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/decay/';
ALTER TABLE `endfb_decay` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/decay/';
