"""Read-only PNG measurement. References never copied into deliverable paths."""
from pathlib import Path
import struct,datetime,json,hashlib
import argparse
ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
src=Path(a.source);items=[]
for i,p in enumerate(sorted(src.glob('*.png'),key=lambda p:(p.stat().st_mtime,p.name)),1):
 b=p.read_bytes()
 assert b[:8]==b'\x89PNG\r\n\x1a\n',p
 w,h=struct.unpack('>II',b[16:24]);s=p.stat()
 items.append(dict(id=f'S{i:02}',filename=p.name,width=w,height=h,bytes=s.st_size,modified_utc=datetime.datetime.fromtimestamp(s.st_mtime,datetime.timezone.utc).isoformat(),sha256=hashlib.sha256(b).hexdigest()))
Path(a.output).write_text(json.dumps({'version':'1.0','date':'2026-10-23','timestamp_policy':'mtime and filenames are ordering clues only; birth/ctime reflect intake copying','screenshots':items,'metadata_files':sorted(p.name for p in src.glob('*:Zone.Identifier'))},ensure_ascii=False,indent=2))
print(f'{len(items)} PNGs; {len(list(src.glob("*:Zone.Identifier")))} metadata files; dimensions/signatures/hash measured')
