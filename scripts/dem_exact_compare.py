# Exact source comparison for global_dem_l6.bin against the HF COG mirror of
# the USGS HRSC/MOLA Blended DEM Global 200m v2.
# Reads overview level 6 (833x1667 page) of the COG via HTTP range requests and
# compares every cell against the shipped binary. Pixel-exact equality is the
# pass criterion (no tolerance).
#
# Usage:  python3 dem_exact_compare.py [path/to/global_dem_l6.bin]
# Needs:  pip install tifffile imagecodecs requests numpy

import io
import struct
import sys

import numpy as np
import requests
import tifffile

URL = "https://huggingface.co/datasets/Biscut4Biscuit/mola-hrsc-baseline-cog/resolve/main/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2_cog.tif"
BIN = sys.argv[1] if len(sys.argv) > 1 else "public/data/global_dem_l6.bin"
W, H = 1667, 833


class RangeFile(io.RawIOBase):
    """Minimal seekable file object over HTTP Range requests (read-on-call)."""

    def __init__(self, url):
        self.url = url
        self.pos = 0
        self.size = int(requests.head(url, allow_redirects=True).headers["Content-Length"])

    def readable(self):
        return True

    def seekable(self):
        return True

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def tell(self):
        return self.pos

    def readinto(self, b):
        n = len(b)
        if n == 0:
            return 0
        r = requests.get(self.url, headers={"Range": f"bytes={self.pos}-{self.pos+n-1}"})
        r.raise_for_status()
        data = r.content
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


tif = tifffile.TiffFile(io.BufferedReader(RangeFile(URL), buffer_size=1 << 20))
pg = tif.pages[6]  # overview level 6 = 2^6 = 64x downsample -> (833, 1667)
assert (pg.shape[0], pg.shape[1]) == (H, W), f"overview shape {pg.shape} != {(H, W)}"
print("source overview:", pg.shape, pg.dtype)
print("source GDAL_NODATA:", pg.tags.get("GDAL_NODATA").value if "GDAL_NODATA" in pg.tags else None)
print("source byte order:", tif.byteorder, "(must match the Int16Array platform read)")

arr = pg.asarray()
ship = np.frombuffer(open(BIN, "rb").read(), dtype="<i2").reshape(H, W)
print("source min/max:", int(arr.min()), int(arr.max()))
print("shipped min/max:", int(ship.min()), int(ship.max()))

eq = arr == ship
print("pixel-exact equal:", bool(eq.all()), "| mismatches:", int((~eq).sum()))
if not eq.all():
    d = arr.astype(np.int32) - ship.astype(np.int32)
    print("diff min/max:", int(d.min()), int(d.max()))
    for y, x in np.argwhere(~eq)[:10]:
        print("  at row/col", y, x, "src", int(arr[y, x]), "ship", int(ship[y, x]))
    sys.exit(1)

# nodata audit: source declares -32768; confirm no such cells are present.
nodata_cells = int((arr == -32768).sum())
print("nodata (-32768) cells present in grid:", nodata_cells)
