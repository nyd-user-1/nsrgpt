CREATE EXTERNAL TABLE `exfor_j4_reactions` (
  `entry` string,
  `subent` string,
  `pointer` string,
  `reaction_no` bigint,
  `unit_no` bigint,
  `code` string,
  `unit_combination` string,
  `unit_code` string,
  `reaction` string,
  `target` string,
  `target_za` bigint,
  `target_state` string,
  `projectile` string,
  `projectile_za` bigint,
  `process` string,
  `product` string,
  `product_za` bigint,
  `product_state` string,
  `quantity` string,
  `quantity_236` string,
  `data_type` string,
  `general_quantity_modifier` string,
  `free_text` string
)
COMMENT 'J4 j4-2026-10-28 reactions'
STORED AS PARQUET
LOCATION 's3://nsr-lake-613473203863/lake/exfor/j4-2026-10-28/reactions/'
TBLPROPERTIES ('parquet.compression'='SNAPPY');
