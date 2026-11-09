CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_decay_lines` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `spectrum_seq` int,
  `styp` double,
  `lcon` int,
  `lcov` int,
  `ner` int,
  `fd` double,
  `fd_unc` double,
  `erav_ev` double,
  `erav_unc` double,
  `fc` double,
  `fc_unc` double,
  `continuum` boolean,
  `line_seq` int,
  `er_ev` double,
  `er_unc` double,
  `rtyp` double,
  `type` double,
  `ri` double,
  `ri_unc` double,
  `ris` double,
  `ris_unc` double,
  `ricc` double,
  `ricc_unc` double,
  `rick` double,
  `rick_unc` double,
  `ricl` double,
  `ricl_unc` double,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/decay_lines/';
ALTER TABLE `endfb_decay_lines` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/decay_lines/';
