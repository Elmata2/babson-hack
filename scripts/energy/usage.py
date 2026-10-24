"""
@built F-75 parse Mass Save "Town-by-Town Savings in 2023" into towns.csv

Usage: python3 -I scripts/energy/usage.py <tbt.html> <ma-towns.json> <out towns.csv>
Source: https://www.masssave.com/about-us/2024-annual-impact-report/town-by-town-data
Columns read: "Annual Electric Usage (MWh)" and "Annual Electric Incentives ($)", residential only. The page footnotes "Municipal"
(town served by a municipal utility) and "Suppressed" (aggregated for privacy); both stay
distinguishable in the `status` column.
"""
import csv, json, re, sys
from html.parser import HTMLParser

src, geo, out = sys.argv[1:4]


class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.rows = []; s.c = None; s.r = None

    def handle_starttag(s, t, a):
        if t == 'tr': s.r = []
        if t in ('td', 'th') and s.r is not None: s.c = ''

    def handle_endtag(s, t):
        if t in ('td', 'th') and s.c is not None: s.r.append(s.c.strip()); s.c = None
        if t == 'tr' and s.r is not None: s.rows.append(s.r); s.r = None

    def handle_data(s, d):
        if s.c is not None: s.c += d


def money(town, cell):
    c = cell.replace(',', '').replace('$', '').strip()
    if re.fullmatch(r'\d+(\.\d+)?', c): return c
    if c.lower() in ('suppressed', 'municipal', ''): return ''
    sys.exit(f'{town}: unreadable incentives cell {cell!r}')


p = P(); p.feed(open(src).read())
rows = [r for r in p.rows if len(r) >= 7]
towns = {f['properties']['town'] for f in json.load(open(geo))['features']}
usage = {r[0].upper(): r[1].replace(',', '') for r in rows[1:]}
incentives = {r[0].upper(): r[3].strip() for r in rows[1:]}
unknown = sorted(set(usage) - towns)
if unknown: print('not in geometry:', unknown, file=sys.stderr)

w = csv.writer(open(out, 'w', newline=''))
w.writerow(['town', 'year', 'status', 'res_mwh', 'res_incentives_usd'])
counts = {'reported': 0, 'municipal': 0, 'suppressed': 0}
for t in sorted(towns):
    v = usage.get(t, '')
    if v.isdigit(): status, mwh = 'reported', v
    elif v.lower() == 'municipal': status, mwh = 'municipal', ''
    elif v.lower() == 'suppressed': status, mwh = 'suppressed', ''
    else: sys.exit(f'{t}: unreadable usage cell {v!r}')
    inc = money(t, incentives.get(t, ''))
    if status != 'reported': inc = ''
    counts[status] += 1
    w.writerow([t, 2023, status, mwh, inc])
print(counts)
