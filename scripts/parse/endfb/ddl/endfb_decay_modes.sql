CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_decay_modes` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mode_seq` int,
  `rtyp` double,
  `rfs` double,
  `q_ev` double,
  `q_unc` double,
  `br` double,
  `br_unc` double
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/decay_modes/';
ALTER TABLE `endfb_decay_modes` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/decay_modes/';
