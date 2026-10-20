#!/usr/bin/env python3
"""Regression checks for fork content routing and non-destructive installer failures."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class IndependentSetup(unittest.TestCase):
    def test_generated_content_uses_configured_source(self):
        source = json.loads((ROOT / 'config/repository.json').read_text())
        base = f"https://raw.githubusercontent.com/{source['repository']}/{source['ref']}/"
        for name in ('tv.html', 'urtv.html'):
            page = (ROOT / 'dist' / name).read_text()
            self.assertIn(f"const PHOTO_BASE = '{base}photos/';", page)
            self.assertNotIn('tshi-dev/UrTV', page)
        page = (ROOT / 'dist/tv.html').read_text()
        self.assertIn(base + 'assets/fonts/Thmanyah-Regular.woff2', page)
        self.assertIn(base + 'assets/screensaver/', page)

    def test_runtime_sources_do_not_fetch_upstream(self):
        for folder, suffixes in [('src', {'.py', '.html'}), ('android', {'.java', '.gradle'}),
                                 ('optimize', {'.sh'})]:
            for p in (ROOT / folder).rglob('*'):
                if p.suffix in suffixes and not {'build', 'venv', '.gradle'} & set(p.parts):
                    self.assertNotIn('tshi-dev/UrTV', p.read_text(), str(p))

    def test_installer_failure_preserves_app_and_settings(self):
        from readiness_test import Installer
        for mode in ('signature', 'downgrade'):
            with self.subTest(mode=mode):
                result, calls = Installer().run_install(mode)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn('uninstall', calls)
                self.assertNotIn('pm clear', calls)
                self.assertNotIn('EFFECT SET_HOME', calls)



if __name__ == '__main__':
    unittest.main(verbosity=2)
