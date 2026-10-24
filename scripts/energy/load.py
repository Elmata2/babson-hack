"""
@built F-75 pull ISO-NE zonal hourly demand for two reference days from EIA-930

Usage: python3 -I scripts/energy/load.py <dir with the two EIA930_SUBREGION csv files> <out load.csv>
Sources: https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_2026_Jan_Jun.csv
         https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_2026_Jul_Dec.csv
Sub-regions 4008 (NEMASSBOST), 4006 (SEMASS), 4007 (WCMASS) of balancing authority ISNE.
Hour 1-24 is hour ending, local time.
"""
import csv, os, sys
from collections import Counter

d, out = sys.argv[1:3]
zm = {'4008': 'NEMASSBOST', '4006': 'SEMASS', '4007': 'WCMASS'}
days = {'01/15/2026': '2026-01-15', '07/15/2026': '2026-07-15'}
rows = []
for f in ['EIA930_SUBREGION_2026_Jan_Jun.csv', 'EIA930_SUBREGION_2026_Jul_Dec.csv']:
    for r in csv.DictReader(open(os.path.join(d, f), newline='')):
        if r['Balancing Authority'] == 'ISNE' and r['Sub-Region'] in zm and r['Data Date'] in days:
            rows.append((days[r['Data Date']], int(r['Hour Number']), zm[r['Sub-Region']], r['Demand (MW)']))
rows.sort()
w = csv.writer(open(out, 'w', newline='')); w.writerow(['date', 'hour', 'zone', 'mw']); w.writerows(rows)
print(len(rows), Counter((r[0], r[2]) for r in rows), 'blank:', sum(1 for r in rows if r[3] == ''))
