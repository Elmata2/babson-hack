"""
@built households per MA town from the ACS 5-year table-based Summary File, no API key

Usage: python3 -I scripts/energy/households.py <acsdt5y2023-b11001.dat> <Geos20235YR.txt> <ma-towns.json> <out households.csv>
Source data: https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/acsdt5y2023-b11001.dat
Geography: https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/documentation/Geos20235YR.txt
Reads B11001_E001 (total households) and B11001_M001 (margin of error) for summary level 060 (county subdivisions, MA towns), state 25.
Exits non-zero if any town in the geometry has no household count.
"""
import csv, json, re, sys

dat, geos, geo, out = sys.argv[1:5]

with open(geos, encoding='utf-8-sig') as f:
    head = f.readline().rstrip('\n').split('|')
    ix = {k: n for n, k in enumerate(head)}
    names = {}
    for line in f:
        r = line.rstrip('\n').split('|')
        if len(r) != len(head) or r[ix['STUSAB']] != 'MA' or r[ix['SUMLEVEL']] != '060':
            continue
        names[r[ix['GEO_ID']]] = r[ix['NAME']].split(',')[0]

with open(dat, encoding='utf-8') as f:
    head = f.readline().rstrip('\n').split('|')
    ix = {k: n for n, k in enumerate(head)}
    est = {}
    for line in f:
        r = line.rstrip('\n').split('|')
        if r[0] in names:
            est[r[0]] = (r[ix['B11001_E001']], r[ix['B11001_M001']])


def town_key(name):
    n = re.sub(r' (Town city|town|city)$', '', name)
    return n.upper()


by_town = {}
for gid, name in names.items():
    if name.startswith('County subdivisions not defined'):
        continue
    by_town[town_key(name)] = (gid, *est.get(gid, ('', '')))

geometry = sorted(f['properties']['town'] for f in json.load(open(geo))['features'])
missing = [t for t in geometry if t not in by_town or not by_town[t][1].isdigit() or int(by_town[t][1]) <= 0]
if missing:
    sys.exit(f'no ACS household count for {len(missing)} towns: {missing}')

with open(out, 'w', newline='') as o:
    w = csv.writer(o)
    w.writerow(['town', 'households', 'moe', 'geoid'])
    for t in geometry:
        gid, e, m = by_town[t]
        w.writerow([t, e, m, gid.split('US')[1]])
print(len(geometry), 'towns')
