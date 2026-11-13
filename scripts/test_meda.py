#!/usr/bin/env python3
"""Source-backed MEDA test: recompute per-sensor min/max ranges from the raw
PDS CAL_ATS / CAL_PS CSVs in data_raw/meda/ and assert that src/data/meda.json
and the station captions in src/data/stations.json carry exactly those values.

Verifies: expected columns per product label, no empty or non-numeric cells
(the labels declare no fill/special constants), row counts, and range match.
Exits non-zero on any mismatch.
"""
import csv, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATS_COLS = ['ATS_LOCAL_TEMP%d' % i for i in range(1, 6)]
PS_COLS = ['BAROCAP%d_PRESSURE' % i for i in (1, 2, 3)]

def scan(path, cols):
    rows = 0
    bad = 0
    mn = {c: float('inf') for c in cols}
    mx = {c: float('-inf') for c in cols}
    with open(path, newline='') as f:
        r = csv.reader(f)
        header = next(r)
        for c in cols:
            assert c in header, f'{path}: missing column {c}'
        idx = [header.index(c) for c in cols]
        for row in r:
            rows += 1
            for c, i in zip(cols, idx):
                v = row[i].strip()
                if not v:
                    bad += 1
                    continue
                try:
                    x = float(v)
                except ValueError:
                    bad += 1
                    continue
                mn[c] = min(mn[c], x)
                mx[c] = max(mx[c], x)
    return rows, bad, mn, mx

fails = 0
meda = json.load(open(os.path.join(ROOT, 'src/data/meda.json')))
stations = json.load(open(os.path.join(ROOT, 'src/data/stations.json')))
captions = {s['sol']: s['meda'] for s in stations if 'meda' in s}

for sol in ('477', '502'):
    rows, bad, mn, mx = scan(os.path.join(ROOT, f'data_raw/meda/0{sol}_ATS.csv'), ATS_COLS)
    assert bad == 0, f'sol {sol}: {bad} empty/non-numeric ATS cells (labels declare no fill constants)'
    exp_rows = meda[sol]['atsRows']
    if rows != exp_rows:
        print(f'FAIL sol {sol} ATS rows {rows} != meda.json {exp_rows}'); fails += 1
    for i, c in enumerate(ATS_COLS, 1):
        got = meda[sol]['ats'][str(i)]
        if round(mn[c], 1) != got['minK'] or round(mx[c], 1) != got['maxK']:
            print(f'FAIL sol {sol} {c}: recomputed {mn[c]:.1f}-{mx[c]:.1f} K != meda.json {got}'); fails += 1
        cap = captions[int(sol)]
        lo, hi = round(mn[c] - 273.15, 1), round(mx[c] - 273.15, 1)
        frag = f'T{i} {lo:+.1f} to {hi:+.1f}'
        if frag not in cap:
            print(f'FAIL sol {sol} caption missing "{frag}"'); fails += 1
    rows, bad, mn, mx = scan(os.path.join(ROOT, f'data_raw/meda/0{sol}_PS.csv'), PS_COLS)
    assert bad == 0, f'sol {sol}: {bad} empty/non-numeric PS cells'
    for i, c in enumerate(PS_COLS, 1):
        got = meda[sol]['ps'][c]
        if round(mn[c], 1) != got['minPa'] or round(mx[c], 1) != got['maxPa']:
            print(f'FAIL sol {sol} {c}: recomputed {mn[c]:.1f}-{mx[c]:.1f} Pa != meda.json {got}'); fails += 1
        cap = captions[int(sol)]
        frag = f'BAROCAP{i} {mn[c]:.1f}-{mx[c]:.1f} Pa'
        if frag not in cap:
            print(f'FAIL sol {sol} caption missing "{frag}"'); fails += 1
    assert 'no empty, non-numeric, or non-finite cells' in captions[int(sol)], f'sol {sol} caption missing parse-honesty phrase'
    assert 'quality filtering' in captions[int(sol)], f'sol {sol} caption missing no-quality-filtering disclosure'
    print(f'sol {sol}: ATS {meda[sol]["atsRows"]} rows, PS {meda[sol]["psRows"]} rows, per-sensor ranges and captions match raw CSVs')

if fails:
    print(f'{fails} MISMATCHES')
    sys.exit(1)
print('MEDA source test: ALL PASS')
