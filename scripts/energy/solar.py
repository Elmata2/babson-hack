"""
@built F-75 aggregate MassCEC Production Tracking System solar PV systems by town

Usage: python3 -I scripts/energy/solar.py <Solar-PV-Systems-in-MA-as-of-Jan-2025.xlsx> <ma-towns.json> <out solar.csv>
Source: https://www.masscec.com/sites/default/files/documents/Solar-PV-Systems-in-MA-as-of-Jan-2025.xlsx
Sheet PvinPTSwebsite, first column kW DC, fifth column town. As of 2025-01-14. Self-reported;
SMART-only systems from 2022-2024 are under-captured.
"""
import collections, csv, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xl

src, geo, out = sys.argv[1:4]
towns = {f['properties']['town'] for f in json.load(open(geo))['features']}
agg = collections.defaultdict(lambda: [0.0, 0]); bad = collections.Counter()
for n, r in xl.sheets(src):
    if n != 'PvinPTSwebsite': continue
    for i, x in enumerate(r):
        if i < 11 or len(x) < 5 or not x[0]: continue
        try: kw = float(x[0])
        except ValueError: continue
        c = x[4].strip().upper()
        c = 'MANCHESTER-BY-THE-SEA' if c == 'MANCHESTER' else c
        if c not in towns: bad[c] += 1; continue
        agg[c][0] += kw; agg[c][1] += 1
print(len(agg), 'towns,', sum(bad.values()), 'rows outside the geometry', bad.most_common(10))
print(round(sum(v[0] for v in agg.values()) / 1000, 1), 'MW', sum(v[1] for v in agg.values()), 'systems')
w = csv.writer(open(out, 'w', newline='')); w.writerow(['town', 'as_of', 'installed_mw', 'count'])
for t in sorted(towns):
    if t in agg: w.writerow([t, '2025-01-14', round(agg[t][0] / 1000, 4), agg[t][1]])
    else: w.writerow([t, '', '', ''])
