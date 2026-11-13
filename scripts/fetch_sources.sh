#!/bin/sh
# Re-download every raw source file, then verify what was downloaded.
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

# Immutable, versioned files: verify bytes against the checksums recorded at
# audit time. Fails the script if any file does not match.
grep -v 'M20_waypoints_current' data_raw/SHA256SUMS.txt | sha256sum -c -

# The live waypoint feed is mutable (it always carries the latest sol): its
# checksum in SHA256SUMS.txt documents the exact bytes used at audit time and
# is expected to differ on re-fetch. Historical positions are audited against
# the immutable dated snapshots above, so here we validate structure only.
python3 -c "import json; d=json.load(open('data_raw/M20_waypoints_current.json')); assert d.get('features'), 'live feed has no features'; print('M20_waypoints_current.json: valid JSON with features (mutable upstream; audit-time bytes recorded in SHA256SUMS.txt)')"
