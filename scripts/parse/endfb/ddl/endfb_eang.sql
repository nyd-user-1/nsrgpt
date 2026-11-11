CREATE EXTERNAL TABLE IF NOT EXISTS `endfb_eang` (
  `sublibrary` string,
  `file_name` string,
  `mat` int,
  `mt` int,
  `lct` int,
  `product_seq` int,
  `zap` double,
  `awp` double,
  `lip` int,
  `law` int,
  `lang` int,
  `lep` int,
  `quantity` string,
  `e_seq` int,
  `e_in_ev` double,
  `e_interpolation` int,
  `e_out_ev` double,
  `mu_or_l` double,
  `value` double,
  `interpolation` int,
  `params` string
)
PARTITIONED BY (`release` string)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/endfb/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-VIII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.1/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-VIII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VIII.0/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-VII.1') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.1/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-VII.0') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VII.0/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-VI.8') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-VI.8/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-V') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-V/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-IV') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-IV/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-III') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-III/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='B-II') LOCATION 's3://nsr-lake-613473203863/lake/endfb/B-II/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='CENDL-3.2') LOCATION 's3://nsr-lake-613473203863/lake/endfb/CENDL-3.2/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='JEFF-3.3') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JEFF-3.3/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='JENDL-5') LOCATION 's3://nsr-lake-613473203863/lake/endfb/JENDL-5/eang/';
ALTER TABLE `endfb_eang` ADD IF NOT EXISTS PARTITION (release='TENDL-2023') LOCATION 's3://nsr-lake-613473203863/lake/endfb/TENDL-2023/eang/';
