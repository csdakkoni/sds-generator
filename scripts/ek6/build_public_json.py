"""Builds apps/web/public/ek6/sea-ek6-substances.json from the parsed Ek-6 Table 3.

usage: python3 build_public_json.py <parsed.json> <current-public.json> <out.json>

Keeps names from the current file, takes numbers and classification fields from the
parse, keeps the raw note and special-limit/M-factor text, strips control characters (Postgres rejects them) and nulls a CAS number that an
earlier entry already uses (substances.cas_number is unique; the entry stays keyed by list_no).
"""
import json
import re
import sys

parsed, current, out = sys.argv[1:4]
by_index = {r['index']: r for r in json.load(open(parsed, encoding='utf-8'))}
cur = json.load(open(current, encoding='utf-8'))
squash = lambda s: re.sub(r'\s+', ' ', s).strip() if isinstance(s, str) else s
seen, entries = {}, []
for c in cur['entries']:
    n = by_index[c['list_no']]
    cas = n.get('cas')
    if cas:
        if cas in seen:
            cas = None
        else:
            seen[cas] = c['list_no']
    entries.append({
        'list_no': c['list_no'], 'name_en': c['name_en'], 'name_tr': c['name_tr'],
        'ec': n.get('ec') or None, 'cas': cas,
        'classification_text': squash(n.get('classification')) or None,
        'ec_list': n.get('ec_list') or [], 'cas_list': n.get('cas_list') or [],
        'classification_h': n.get('class_h') or [],
        'label_pictograms': n.get('label_pictograms') or [],
        'signal_word': n.get('signal_word'),
        'label_h': n.get('label_h') or [], 'euh': n.get('euh') or [],
        'note': squash(n.get('note')) or None,
        'scl_m_text': squash(n.get('scl_m_text')) or None,
    })
text = json.dumps({'source': cur['source'], 'count': len(entries), 'entries': entries}, ensure_ascii=False)
assert not re.search(r'[\x00-\x1f]', text), 'control character left in output'
open(out, 'w', encoding='utf-8').write(text)
print('entries', len(entries), '| CAS', sum(1 for e in entries if e['cas']), '| EC', sum(1 for e in entries if e['ec']),
      '| classified', sum(1 for e in entries if e['classification_text']))
