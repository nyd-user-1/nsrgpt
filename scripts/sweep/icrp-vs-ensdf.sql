-- ICRP 107 half-lives against ENSDF (docs/briefs/48-icrp-vs-ensdf-half-lives.md). Run in the Athena workgroup
-- "primary" (nsrgpt enforces an output location, which a CTAS with external_location refuses) after emptying
-- s3://nsr-lake-613473203863/lake/icrp107/2008/vs_ensdf/ and DROP TABLE IF EXISTS nsr.icrp107_vs_ensdf.
CREATE TABLE nsr.icrp107_vs_ensdf
WITH (format = 'PARQUET', external_location = 's3://nsr-lake-613473203863/lake/icrp107/2008/vs_ensdf/')
AS
WITH parsed AS (
  SELECT z, a, level_seq, energy_kev, jpi, half_life_s, half_life_text,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 1), '') AS mant,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 4), '') AS u1,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 6), '') AS u2
  FROM nuclide_serve_levels WHERE half_life_s IS NOT NULL AND half_life_s > 0
), lv AS (
  SELECT z, a, level_seq, energy_kev, jpi, half_life_s, half_life_text,
    CASE WHEN mant <> '' AND u1 <> '' THEN
      greatest(CAST(u1 AS double), CAST(CASE WHEN u2 = '' THEN u1 ELSE u2 END AS double))
      * power(10, -length(coalesce(regexp_extract(mant, '\.([0-9]+)$', 1), ''))) / CAST(mant AS double) END AS rel_unc
  FROM parsed
), g AS (
  SELECT s.z, s.a, s.nucid, s.half_life_s, s.half_life_text, l.rel_unc, l.jpi, s.decay_modes
  FROM nuclide_serve_summary s LEFT JOIN lv l ON l.z = s.z AND l.a = s.a AND l.level_seq = 1
  WHERE s.half_life_s IS NOT NULL AND s.half_life_s > 0
), i AS (
  SELECT nuclide, element, z, a, isomer, half_life, half_life_unit, half_life_s AS icrp_s, decay_modes AS icrp_modes
  FROM icrp107_nuclides WHERE isomer IN ('', 'm')
), nearest_iso AS (
  SELECT i.nuclide, i.isomer, l.level_seq, l.energy_kev, l.jpi, l.half_life_s, l.half_life_text, l.rel_unc,
    row_number() OVER (PARTITION BY i.nuclide ORDER BY abs(ln(l.half_life_s) - ln(i.icrp_s)), l.level_seq) AS rn
  FROM i JOIN lv l ON l.z = i.z AND l.a = i.a AND l.level_seq > 1
  WHERE i.isomer = 'm'
), base AS (
  SELECT i.nuclide, i.element, i.z, i.a, i.isomer, i.half_life AS icrp_half_life, i.half_life_unit AS icrp_unit, i.icrp_s, i.icrp_modes,
    CASE WHEN i.isomer = '' THEN g.nucid ELSE concat(g.nucid, 'm') END AS ensdf_name,
    CASE WHEN i.isomer = '' THEN 1 ELSE n.level_seq END AS ensdf_level_seq,
    CASE WHEN i.isomer = '' THEN CAST(0 AS double) ELSE n.energy_kev END AS ensdf_level_kev,
    CASE WHEN i.isomer = '' THEN g.jpi ELSE n.jpi END AS ensdf_jpi,
    CASE WHEN i.isomer = '' THEN g.half_life_s ELSE n.half_life_s END AS ensdf_s,
    CASE WHEN i.isomer = '' THEN g.half_life_text ELSE n.half_life_text END AS ensdf_text,
    CASE WHEN i.isomer = '' THEN g.rel_unc ELSE n.rel_unc END AS ensdf_rel_unc,
    g.decay_modes AS ensdf_ground_modes
  FROM i
  LEFT JOIN g ON g.z = i.z AND g.a = i.a
  LEFT JOIN nearest_iso n ON n.nuclide = i.nuclide AND n.rn = 1
), alt AS (
  SELECT b.nuclide, b.isomer, l.level_seq, l.energy_kev, l.jpi, l.half_life_text,
    row_number() OVER (PARTITION BY b.nuclide, b.isomer ORDER BY abs(l.half_life_s - b.icrp_s) / b.icrp_s) AS rn
  FROM base b JOIN lv l ON l.z = b.z AND l.a = b.a
  WHERE b.isomer = '' AND l.level_seq <> 1 AND abs(l.half_life_s - b.icrp_s) / b.icrp_s < 0.02
)
SELECT b.*,
  CASE WHEN b.ensdf_s IS NULL THEN NULL ELSE (b.icrp_s - b.ensdf_s) / b.ensdf_s END AS rel_diff,
  CASE WHEN b.ensdf_s IS NULL OR b.ensdf_rel_unc IS NULL OR b.ensdf_rel_unc = 0 THEN NULL ELSE abs(b.icrp_s - b.ensdf_s) / b.ensdf_s / b.ensdf_rel_unc END AS sigmas,
  a.level_seq AS alt_level_seq, a.energy_kev AS alt_level_kev, a.jpi AS alt_jpi, a.half_life_text AS alt_text,
  CASE
    WHEN b.ensdf_s IS NULL THEN 'no ENSDF half-life for this state'
    WHEN b.isomer = 'm' AND abs(b.icrp_s - b.ensdf_s) / b.ensdf_s > 0.2 THEN 'no ENSDF isomer within 20% of the ICRP half-life'
    WHEN regexp_like(b.ensdf_text, ' (GT|LT|GE|LE|AP)') THEN 'ENSDF gives a limit or approximate value'
    WHEN b.isomer = '' AND abs(b.icrp_s - b.ensdf_s) / b.ensdf_s > 0.02 AND a.level_seq IS NOT NULL THEN 'the ICRP ground state is another ENSDF level: state ordering differs'
    WHEN b.ensdf_rel_unc IS NULL THEN 'ENSDF uncertainty not parsed'
    WHEN abs(b.icrp_s - b.ensdf_s) / b.ensdf_s / b.ensdf_rel_unc <= 3 THEN 'agree within 3 sigma of ENSDF'
    ELSE 'differ by more than 3 sigma of ENSDF'
  END AS note
FROM base b LEFT JOIN alt a ON a.nuclide = b.nuclide AND a.isomer = b.isomer AND a.rn = 1
