#!/usr/bin/env python3
"""Offline integrity and typography checks for the religious reminder bundle."""
import json
from pathlib import Path
import re
import unittest

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]


class Reminders(unittest.TestCase):
    def test_complete_distinct_records_and_references(self):
        data = json.loads((ROOT / 'assets/shared/reminders.json').read_text())
        for kind in ['verses', 'hadiths']:
            records = data[kind]
            self.assertGreaterEqual(len(records), 12)
            self.assertEqual(len(records), len({r['id'] for r in records}))
            self.assertEqual(len(records), len({r['text'] for r in records}))
            self.assertTrue(all(r['text'] and '…' not in r['text'] for r in records))
        for record in data['verses']:
            self.assertRegex(record['id'], r'^\d+:\d+$')
            self.assertTrue(record['surah'] and record['ayah'] > 0)
        for record in data['hadiths']:
            self.assertEqual(record['book'], 'صحيح البخاري')
            self.assertLessEqual(len(record['text'].split()), 40)
            self.assertGreater(record['number'], 0)
        for source in data['sources'].values():
            self.assertTrue(source['url'].startswith('https://'))
            self.assertRegex(source['sha256'], r'^[0-9a-f]{64}$')

    def test_all_characters_render_without_rewriting_source_text(self):
        data = json.loads((ROOT / 'assets/shared/reminders.json').read_text())
        cmap = TTFont(ROOT / 'assets/fonts/NotoNaskhArabic-Reminders.woff2').getBestCmap()
        for record in data['verses'] + data['hadiths']:
            missing = {c for c in record['text'] if not c.isspace()
                       and c not in '\u200e\u200f' and ord(c) not in cmap}
            self.assertFalse(missing, (record['id'], missing))

    def test_generated_pages_embed_exact_complete_corpus(self):
        data = json.loads((ROOT / 'assets/shared/reminders.json').read_text())
        expected = {key: data[key] for key in ['verses', 'hadiths']}
        for name in ['tv.html', 'urtv.html']:
            page = (ROOT / 'dist' / name).read_text()
            embedded = json.loads(re.search(r'const REMINDERS = (.*);', page).group(1))
            self.assertEqual(embedded, expected)


if __name__ == '__main__':
    unittest.main(verbosity=2)
