#!/usr/bin/env python3
"""Verify the bundled complete records against downloaded, checksum-pinned reference corpora.

Download the two sources declared in assets/shared/reminders.json into REFERENCE_DIR as
urtv-quran-reference.json and urtv-bukhari-reference.json, then run this script with that directory.
This check never rewrites the bundled text or updates the expected reference checksums.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def verify(reference_dir):
    data = json.loads((ROOT / 'assets/shared/reminders.json').read_text())
    sources = {}
    for name, filename in [('quran', 'urtv-quran-reference.json'),
                           ('hadith', 'urtv-bukhari-reference.json')]:
        raw = (reference_dir / filename).read_bytes()
        if hashlib.sha256(raw).hexdigest() != data['sources'][name]['sha256']:
            raise ValueError(f'{name}: reference checksum mismatch; review the upstream change')
        sources[name] = json.loads(raw)
    surahs = {str(s['id']): s for s in sources['quran']}
    for record in data['verses']:
        surah, ayah = record['id'].split(':')
        original = next(v for v in surahs[surah]['verses'] if v['id'] == int(ayah))
        if (record['text'] != original['text'] or record['surah'] != surahs[surah]['name']
                or record['ayah'] != int(ayah)):
            raise ValueError(f"Verse {record['id']}: text or reference mismatch")
    narrations = {str(h['hadithnumber']): h for h in sources['hadith']['hadiths']}
    for record in data['hadiths']:
        if (record['text'] != narrations[record['id']]['text']
                or record['number'] != narrations[record['id']]['hadithnumber']
                or record['book'] != 'صحيح البخاري'):
            raise ValueError(f"Hadith {record['id']}: full narration or reference mismatch")
    print(f"Verified {len(data['verses'])} complete verses and {len(data['hadiths'])} complete Bukhari narrations")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 .github/tools/verify_reminders.py REFERENCE_DIR')
    verify(Path(sys.argv[1]))
