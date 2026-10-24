import zipfile,re
import xml.etree.ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def col(ref):
    n=0
    for c in re.match(r'[A-Z]+',ref).group(): n=n*26+ord(c)-64
    return n-1
def sheets(path):
    z=zipfile.ZipFile(path)
    ss=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.parse(z.open('xl/sharedStrings.xml')).getroot():
            ss.append(''.join(t.text or '' for t in si.iter(NS+'t')))
    wb=ET.parse(z.open('xl/workbook.xml')).getroot()
    names=[s.get('name') for s in wb.iter(NS+'sheet')]
    for i,n in enumerate(names,1):
        yield n,rows(z,f'xl/worksheets/sheet{i}.xml',ss)
def rows(z,p,ss):
    for _,row in ET.iterparse(z.open(p)):
        if row.tag!=NS+'row':continue
        out={}
        for c in row.iter(NS+'c'):
            v=c.find(NS+'v');t=c.get('t')
            if t=='inlineStr': val=''.join(x.text or '' for x in c.iter(NS+'t'))
            elif v is None: continue
            elif t=='s': val=ss[int(v.text)]
            else: val=v.text
            out[col(c.get('r'))]=val
        row.clear()
        yield [out.get(i,'') for i in range(max(out)+1)] if out else []
