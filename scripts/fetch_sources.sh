#!/bin/sh
# Re-download every raw source file, then verify checksums.
set -e
mkdir -p data_raw
curl -sL -o data_raw/dtm.tif "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
curl -sL -o data_raw/orthomosaic_6m.tif "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif"
curl -sL -o data_raw/M20_waypoints_current.json "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json"
for f in waypoints_2022-06-26 waypoints_2022-07-19 waypoints_2022-12-23; do
  curl -sL -o "data_raw/$f.json" "https://raw.githubusercontent.com/stiles/mars-perseverance-waypoints/main/data/raw/$f.json"
done
curl -sL -o data_raw/sim3464_database.zip "https://pubs.usgs.gov/sim/3464/sim3464_database.zip"
unzip -oq data_raw/sim3464_database.zip -d data_raw/
echo "downloads complete; verify with: sha256sum -c data_raw/SHA256SUMS.txt"
