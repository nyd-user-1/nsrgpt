CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_edist` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `subsection` int,
  `lf` int,
  `u_ev` double,
  `kind` string,
  `e_seq` int,
  `e_in_ev` double,
  `e_interpolation` int,
  `e_out_ev` double,
  `value` double,
  `interpolation` int,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/edist/';
ALTER TABLE `endfb_edist` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/edist/';
