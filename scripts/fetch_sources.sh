#!/bin/sh
# Re-download all raw source data and verify checksums (see SHA256SUMS.txt).
set -e
mkdir -p data_raw
curl -sL -o data_raw/dtm.tif "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
curl -sL -o data_raw/rover_points_full.geojson "https://raw.githubusercontent.com/stiles/mars-perseverance-waypoints/main/data/processed/rover_points_full.geojson"
curl -sL -o data_raw/M20_waypoints_current.json "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json"
curl -sL -o data_raw/sim3464_database.zip "https://pubs.usgs.gov/sim/3464/sim3464_database.zip"
sha256sum -c data_raw/SHA256SUMS.txt

curl -sL -o /tmp/sim3464_database.zip "https://pubs.usgs.gov/sim/3464/sim3464_database.zip"
unzip -oq /tmp/sim3464_database.zip -d data_raw/
echo "verify: sha256sum -c data_raw/SHA256SUMS.txt (paths adjusted)"
