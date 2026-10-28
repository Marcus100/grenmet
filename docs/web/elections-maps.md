# Elections Grenada maps

Maps offer **Constituencies** for a national overview and **Polling divisions**
where the selected event and measure have division records and located shapes.
Selecting a constituency in the results atlas still drills into its divisions.
Earlier elections without compatible geography retain historical result cards.

The two levels use independently calculated measures. Never repeat a
constituency total across its divisions or average division percentages to
construct constituency results. Preserve separately reported constituency totals.
Unknown or unlocated shapes are omitted with an explanation; their records
remain in tables. The current polygons are illustrative reconstructions, not
official eligibility or polling-place boundaries. A matching code alone does not
establish that a division's geographic extent was unchanged between elections.

## Data that would improve accuracy

Request the following from PEO and the relevant Lands and Surveys authority:

1. Official constituency and polling-division polygon files, preferably
   GeoPackage or GeoJSON, with the coordinate reference system and permission to
   redistribute. Retain the original geometry before any display simplification.
2. A stable division identifier, constituency identifier, source, effective-from
   and effective-to dates, and the election(s) to which each geometry applies.
3. A crosswalk for historical divisions that were renamed, split, merged or
   transferred. Station suffixes such as (a)/(b) must map to a division without
   being mistaken for separate geographic divisions.
4. Dated polling-station locations and their division assignments. A station
   point is useful for checking placement; it does not define a division polygon.
5. Current descriptions for B02, B10, C04, D06, H06, K02 and K10, plus clarification
   of divisions present in older results but absent from later village tables.

Keep parish and census enumeration-district layers as supporting references;
they do not substitute for electoral boundaries. Current acquisition gaps are
also recorded in the public source discrepancy records G-01 and G-02.

## Tools worth using when authoritative files arrive

| Tool | Purpose | Limitation |
|---|---|---|
| [QGIS Topology Checker](https://docs.qgis.org/3.44/en/docs/user_manual/plugins/plugins_topology_checker.html) | Visual inspection of overlaps, gaps and containment | Needs review against authoritative descriptions |
| [GDAL](https://gdal.org/en/stable/user/geometry_validity.html) | Read/convert GIS formats and check geometry validity | Valid geometry does not prove a legally correct boundary |
| [GeoPandas](https://geopandas.org/en/latest/docs/reference/api/geopandas.read_file.html) and [Shapely](https://shapely.readthedocs.io/en/2.1.2/reference/shapely.coverage_is_valid.html) | Repeatable identifier joins, CRS handling and geometry/coverage checks | Requires an explicit historical mapping and independent validation |
| [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) | Optional future basemap, pan/zoom and vector-tile rendering | Improves navigation, not source accuracy; current SVGs are sufficient for the level controls |

No new dependencies are required for this feature. Add a GIS processing toolchain
only when source files and validation requirements justify it. Check coordinate
systems, duplicate/missing IDs, invalid rings, overlaps/gaps, parent containment,
date coverage and joins to result records before promoting replacement shapes.
