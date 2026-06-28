# Canonical Parameter Set — Grenada NWP Notebooks

All analysis notebooks normalize raw GRIB fields to these canonical column names.
NaN is used where a model does not provide that field.
This table is the contract for the heatmap in `ensemble/compare.ipynb`.

## Surface parameters (3-hourly or 6-hourly)

| Canonical column | Units | IFS | AIFS | GFS | GEFS mean | AIFS-ENS mean | GRIB source |
|---|---|---|---|---|---|---|---|
| `t2m_c` | °C | ✓ `2t` | ✓ `2t` | ✓ `TMP 2m` | ✓ `TMP 2m` | ✓ `2t` | subtract 273.15 |
| `d2m_c` | °C | ✓ `2d` | ✓ `2d` | ✓ `DPT 2m` | ✓ `DPT 2m` | ✗ | subtract 273.15 |
| `msl_hpa` | hPa | ✓ `msl` | ✓ `msl` | ✓ `PRMSL` | ✓ `PRMSL` | ✓ `msl` | divide by 100 |
| `sp_hpa` | hPa | ✓ `sp` | ✗ | ✓ `PRES sfc` | ✓ `PRES sfc` | ✗ | divide by 100 |
| `wspd_kt` | kt | ✓ `10u+10v` | ✓ `10u+10v` | ✓ `UGRD+VGRD` | ✓ `UGRD+VGRD` | ✓ `10si` | m/s × 1.944 |
| `wdir` | ° | ✓ | ✓ | ✓ | ✓ | ✗ (no components) | arctan2(v,u) |
| `fg10_kt` | kt | ✓ `10fg` | ✗ | ✓ `GUST` | ✓ `GUST` | ✗ | m/s × 1.944 |
| `tcc_pct` | % | ✓ `tcc` (×100) | ✓ `tcc` (×100) | ✓ `TCDC` (already %) | ✗ | ✗ | |
| `tp_mm` | mm/period | ✓ `tp` | ✓ `tp` | ✓ `APCP` | ✓ `APCP`* | ✗ | diff × 1000 |
| `tcwv` | kg/m² | ✓ `tcwv` | ✓ `tcw` | ✓ `PWAT` | ✗ | ✗ | rename |
| `cape` | J/kg | ✓ `mucape` | ✗ | ✓ `CAPE` | ✓ `CAPE` | ✗ | |

*GEFS APCP accumulation windows differ from ECMWF/GFS — use with care.

### New tropical parameters (added 2026-06-02)

| Canonical column | Units | IFS | AIFS | GFS | GEFS mean | AIFS-ENS mean | Notes |
|---|---|---|---|---|---|---|---|
| `skt_c` | °C | ✓ `skt` | ✓ `skt` | ✓ `TMP:sfc` | ✗ | ✓ cf `skt` | subtract 273.15 |
| `cp_mm` | mm/period | ✓ `cp` | ✓ `cp` | ✓ `ACPCP` | ✗ | ✓ cf `cp` | diff ×1000 |
| `lcc_pct` | % | ✓ `lcc` (×100) | ✓ `lcc` (×100) | ✓ `LCDC` (already %) | ✗ | ✓ cf `lcc` | |
| `mcc_pct` | % | ✓ `mcc` | ✓ `mcc` | ✓ `MCDC` | ✗ | ✓ cf `mcc` | |
| `hcc_pct` | % | ✓ `hcc` | ✓ `hcc` | ✓ `HCDC` | ✗ | ✓ cf `hcc` | |
| `cin` | J/kg | ✓ `mucin` | ✗ | ✓ `CIN` | ✓ `CIN` | ✗ | |
| `olr_wm2` | W/m² | ✓ `ttr` | ✗ | ✓ `ULWRF` | ✓ `ULWRF` | ✗ | ECMWF: −diff/period_s; GFS: direct |
| `blh_m` | m | ✓ `blh` | ✗ | ✓ `HPBL` | ✗ | ✗ | |
| `lhf` | W/m² | ✗ | ✗ | ✓ `LHTFL` | ✓ `LHTFL` | ✗ | instantaneous W/m² |
| `shf` | W/m² | ✗ | ✗ | ✓ `SHTFL` | ✓ `SHTFL` | ✗ | instantaneous W/m² |

## Upper-air parameters (12-hourly, 10 levels: 1000–200 hPa)

| Canonical column | Units | IFS | AIFS | GFS | Notes |
|---|---|---|---|---|---|
| `t_c` | °C | ✓ `t` | ✓ `t` | ✓ `TMP` | subtract 273.15 |
| `gh` | m | ✓ `gh` | ✓ `gh` | ✓ `HGT` | |
| `ua_wspd_kt` | kt | ✓ `u+v` | ✓ `u+v` | ✓ `UGRD+VGRD` | m/s × 1.944 |
| `ua_wdir` | ° | ✓ | ✓ | ✓ | |
| `w` | Pa/s | ✓ `w` | ✓ `w` | ✓ `VVEL` | |
| `q_gkg` | g/kg | ✓ `q` | ✓ `q` | ✓ `SPFH` | ×1000 |
| `r_pct` | % | ✓ `r` | ✗ | ✓ `RH` | |
| `vort` | ×10⁻⁵ s⁻¹ | ✓ `vo` (rel) | ✗ | ✓ `ABSV` (abs) | ×10⁵; GFS=absolute |
| `div` | ×10⁻⁵ s⁻¹ | ✓ `d` | ✗ | ✗ | |

## Wave parameters (3-hourly, IFS and GFS only)

| Canonical column | Units | IFS | GFS | Notes |
|---|---|---|---|---|
| `swh` | m | ✓ `swh` | ✓ `HTSGW` | |
| `swh_ft` | ft | ✓ | ✓ | ×3.281 |
| `mwd` | ° | ✓ `mwd` | ✓ `WDIR` | |
| `pp1d` | s | ✓ `pp1d` | ✓ `PERPW` | peak period |
| `mwp` | s | ✓ `mwp` | ✗ | mean period |

## Normalization function (used in all analysis notebooks)

```python
CANONICAL_REMAP = {
    # GFS/GEFS surface
    "prmsl": "msl",    "pwat": "tcwv",  "watr": "ro",
    "gust":  "fg10",   "cape": "cape",
    # AIFS
    "tcw":   "tcwv",
    # GFS wave
    "wdir":  "mwd",    "perpw": "pp1d",
}
```
