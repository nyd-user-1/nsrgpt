-- The libraries' decay sublibraries against ENSDF 2026-11-05: each MT457 half-life (ground state and isomers) beside
-- ENSDF's for the same state, the relative difference and the difference in units of the two stated uncertainties.
-- Run in Athena workgroup "primary" (nsrgpt refuses external_location) after emptying
-- lake/endfb/_compare/decay_vs_ensdf/ and DROP TABLE nsr.endf_decay_vs_ensdf. Brief 56 (worker-1): an ENSDF state
-- quoted as a width (MEV, KEV, EV; its half_life_s is hbar/width) gets the note 'ENSDF gives a width', no rel_diff
-- and no sigmas, and is never matched to a library isomer.
CREATE TABLE nsr.endf_decay_vs_ensdf
WITH (format = 'PARQUET', external_location = 's3://nsr-lake-613473203863/lake/endfb/_compare/decay_vs_ensdf/')
AS
WITH parsed AS (
  SELECT z, a, level_seq, energy_kev, jpi, half_life_s, half_life_text,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 1), '') AS mant,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 4), '') AS u1,
    coalesce(regexp_extract(half_life_text, '^([0-9.]+)(E[+-]?[0-9]+)? +([A-Z]+) +\+?([0-9]+)(-([0-9]+))?$', 6), '') AS u2
  FROM nuclide_serve_levels WHERE half_life_s IS NOT NULL AND half_life_s > 0
), lv AS (
  SELECT z, a, level_seq, energy_kev, jpi, half_life_s, half_life_text,
    regexp_like(half_life_text, '^[0-9.]+(E[+-]?[0-9]+)? +(MEV|KEV|EV)( |$)') AS is_width,
    CASE WHEN mant <> '' AND u1 <> '' THEN
      greatest(CAST(u1 AS double), CAST(CASE WHEN u2 = '' THEN u1 ELSE u2 END AS double))
      * power(10, -length(coalesce(regexp_extract(mant, '\.([0-9]+)$', 1), ''))) / CAST(mant AS double) END AS rel_unc
  FROM parsed
), d AS (
  SELECT release, sublibrary, mat, CAST(za AS integer) AS za, CAST(za AS integer) / 1000 AS z, CAST(za AS integer) % 1000 AS a,
    liso, half_life_s AS endf_s, half_life_unc AS endf_unc, spin, parity
  FROM endfb_decay WHERE NOT stable AND half_life_s IS NOT NULL AND half_life_s > 0
), ground AS (
  SELECT d.*, l.level_seq, l.energy_kev, l.jpi, l.half_life_s AS ensdf_s, l.half_life_text AS ensdf_text, l.rel_unc AS ensdf_rel_unc,
    coalesce(l.is_width, false) AS ensdf_width
  FROM d LEFT JOIN lv l ON l.z = d.z AND l.a = d.a AND l.level_seq = 1 WHERE d.liso = 0
), iso AS (
  SELECT d.*, l.level_seq, l.energy_kev, l.jpi, l.half_life_s AS ensdf_s, l.half_life_text AS ensdf_text, l.rel_unc AS ensdf_rel_unc,
    false AS ensdf_width,
    row_number() OVER (PARTITION BY d.release, d.sublibrary, d.mat, d.liso ORDER BY abs(ln(l.half_life_s) - ln(d.endf_s)), l.level_seq) AS rn
  FROM d JOIN lv l ON l.z = d.z AND l.a = d.a AND l.level_seq > 1 AND NOT l.is_width WHERE d.liso > 0
), both_ AS (
  SELECT release, sublibrary, mat, za, z, a, liso, endf_s, endf_unc, spin, parity, level_seq, energy_kev, jpi, ensdf_s, ensdf_text, ensdf_rel_unc, ensdf_width FROM ground
  UNION ALL
  SELECT release, sublibrary, mat, za, z, a, liso, endf_s, endf_unc, spin, parity, level_seq, energy_kev, jpi, ensdf_s, ensdf_text, ensdf_rel_unc, ensdf_width FROM iso WHERE rn = 1
)
SELECT b.*,
  CASE WHEN ensdf_s IS NULL OR ensdf_width THEN NULL ELSE (endf_s - ensdf_s) / ensdf_s END AS rel_diff,
  CASE WHEN endf_unc IS NULL OR endf_unc <= 0 THEN NULL ELSE endf_unc / endf_s END AS endf_rel_unc,
  CASE WHEN ensdf_s IS NULL OR ensdf_width THEN NULL
       WHEN (endf_unc IS NULL OR endf_unc <= 0) AND ensdf_rel_unc IS NULL THEN NULL
       ELSE abs(endf_s - ensdf_s) / ensdf_s / sqrt(coalesce(power(endf_unc / endf_s, 2), 0) + coalesce(power(ensdf_rel_unc, 2), 0)) END AS sigmas,
  CASE
    WHEN ensdf_width THEN 'ENSDF gives a width'
    WHEN ensdf_s IS NULL THEN 'no ENSDF half-life for this state'
    WHEN liso > 0 AND abs(endf_s - ensdf_s) / ensdf_s > 0.2 THEN 'no ENSDF isomer within 20% of the library half-life'
    WHEN regexp_like(ensdf_text, ' (GT|LT|GE|LE|AP)') THEN 'ENSDF gives a limit or approximate value'
    WHEN (endf_unc IS NULL OR endf_unc <= 0) AND ensdf_rel_unc IS NULL THEN 'no uncertainty on either side'
    WHEN abs(endf_s - ensdf_s) / ensdf_s / sqrt(coalesce(power(endf_unc / endf_s, 2), 0) + coalesce(power(ensdf_rel_unc, 2), 0)) <= 3 THEN 'agree within 3 sigma'
    ELSE 'differ by more than 3 sigma'
  END AS note
FROM both_ b
