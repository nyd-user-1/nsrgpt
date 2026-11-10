CREATE EXTERNAL TABLE `stopping_powers` (
  `projectile_name` string,
  `ion_isotope` double,
  `target_name` string,
  `phase` string,
  `energy` double,
  `energy_unit` string,
  `stopping_power` double,
  `stopping_unit` string,
  `percentage_error` string,
  `target_mass_atom_ratio` double,
  `dataset_last_modification` string,
  `publication_year` int,
  `ref_id` string,
  `citation_reference` string,
  `doi` string,
  `comments` string,
  `facility` string,
  `technique` string,
  `stopping_power_converted` double,
  `stopping_unit_converted` string
)
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/stopping/2026-11-11/powers/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
