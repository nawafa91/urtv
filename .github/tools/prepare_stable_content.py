#!/usr/bin/env python3
"""Prepare (never publish) a stable manifest for an already committed, reviewed standalone page."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]

def prepare(commit, version, min_apk, max_apk):
    if not re.fullmatch(r'[a-f0-9]{40}', commit) or not 1 <= min_apk <= max_apk or version < 1:
        raise ValueError('Use a full immutable commit and positive, ordered versions')
    body = subprocess.check_output(['git', 'show', f'{commit}:dist/urtv.html'], cwd=ROOT)
    text = body.decode('utf-8')
    config = json.loads((ROOT / 'config/repository.json').read_text())
    contract = config['content_contract']
    if not 30000 <= len(body) <= 8 * 1024 * 1024 or f'<meta name="urtv-content-contract" content="{contract}">' not in text or 'window.URTV_READY = true;' not in text:
        raise ValueError('Committed page lacks the current content contract/readiness acknowledgement')
    if 'tshi-dev/urtv' in text.lower() or any(not re.fullmatch('[a-f0-9]{40}', ref) for ref in re.findall(r'https://raw\.githubusercontent\.com/[^/\s]+/[^/\s]+/([^/\s]+)/', text)):
        raise ValueError('Unapproved/moving content references')
    return dict(schema=1, contract=contract, version=version, min_apk=min_apk, max_apk=max_apk,
                commit=commit, sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--commit', required=True)
    p.add_argument('--version', type=int, required=True)
    p.add_argument('--min-apk', type=int, required=True)
    p.add_argument('--max-apk', type=int, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    result = prepare(a.commit, a.version, a.min_apk, a.max_apk)
    with a.output.open('x', encoding='utf-8') as f:
        f.write(json.dumps(result, indent=2) + '\n')
    print(f'Prepared {a.output}; nothing was published.')
