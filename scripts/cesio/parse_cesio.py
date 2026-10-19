"""Reads the CESIO C&L recommendation workbook into plain records.

usage: python3 parse_cesio.py <workbook.xlsx> <out.json>

One record per table row. Values are kept as written in the workbook; the numeric parts of the
carbon chain, EO/PO degree and concentration are also split into min/max with their operators so
that ranges stay ranges. Hazard classes and statements are copied as text from their own columns
and never split into codes here (structured classification is entered after KDU review).
CLP and UN-GHS are kept apart. The workbook is not part of the repository (licence unverified).
"""
import json
import re
import sys

import openpyxl

SHEETS = ['Anionic surfact., other', 'AS', 'AES', 'AE', 'Other surfactants']
# 0-based column positions in every sheet (checked against the header rows).
COL = dict(category=1, family=2, ingredient=3, change=4, cas=5, ec=6, chemical_name=7,
           carbon_chain=8, eo_po=9, form=10, concentration=11, others=12,
           clp_class=13, clp_h=14, clp_signal=15, clp_pictograms=16,
           un_class=17, un_h=18, un_signal=19, un_pictograms=20)
NUM = r'(\d+(?:[.,]\d+)?)'


def clean(value):
    if value is None:
        return None
    text = re.sub(r'[\s\xa0]+', ' ', str(value)).strip()
    return text if text and text != '-' else None


def keep_lines(value):
    """Class/statement cells use line breaks; keep them as ' / ' separators."""
    if value is None:
        return None
    parts = [re.sub(r'[\s\xa0]+', ' ', p).strip() for p in str(value).splitlines()]
    text = ' / '.join(p for p in parts if p)
    return text or None


def num(text):
    return float(text.replace(',', '.'))


def cas_valid(cas):
    digits = cas.replace('-', '')
    if not re.fullmatch(r'\d{2,7}-\d{2}-\d', cas):
        return False
    body, check = digits[:-1], int(digits[-1])
    return sum((i + 1) * int(d) for i, d in enumerate(reversed(body))) % 10 == check


def parse_cas_cell(text):
    """Splits a CAS cell. 'a b' lists several substances; '(c)' marks a former or alternative number.
    A single CAS is returned as `cas` only when exactly one listed number is present and valid."""
    out = {'cas': None, 'cas_list': [], 'cas_alternates': [], 'cas_invalid': []}
    if not text:
        return out
    for token in re.findall(r'\(([^)]*)\)', text):
        out['cas_alternates'] += re.findall(r'\d{2,7}-\d{2}-\d', token)
    for token in re.findall(r'\d{2,7}-\d{2}-\d', re.sub(r'\([^)]*\)', ' ', text)):
        (out['cas_list'] if cas_valid(token) else out['cas_invalid']).append(token)
    if len(out['cas_list']) == 1 and not out['cas_invalid']:
        out['cas'] = out['cas_list'][0]
    return out


def parse_carbon_chain(text):
    """'12-14' -> (12, 14); '12' -> (12, 12); 'C18 unsat.' -> (18, 18). Unparsed text stays in raw."""
    if not text:
        return None, None
    nums = [int(n) for n in re.findall(r'\d+', text)]
    if not nums:
        return None, None
    return min(nums), max(nums)


def parse_eo_po(text):
    """Returns dict with eo_min/eo_max and the operators used; None when not numeric ('not relevant')."""
    if not text or re.search(r'not relevant', text, re.I):
        return None
    t = text.replace(',', '.')
    out = {}
    m = re.search(r'(?:≥|>)\s*' + NUM + r'\s*-\s*(?:≤|<)\s*' + NUM, t)
    if m:
        lo_op = '≥' if '≥' in t[:m.start(1)] else '>'
        hi_op = '≤' if '≤' in t[m.start(1):m.start(2)] else '<'
        return {'min': num(m.group(1)), 'min_op': lo_op, 'max': num(m.group(2)), 'max_op': hi_op}
    m = re.search(NUM + r'\s*-\s*' + NUM, t)
    if m:
        return {'min': num(m.group(1)), 'min_op': '≥', 'max': num(m.group(2)), 'max_op': '≤'}
    m = re.search(r'(<|≤)\s*' + NUM, t)
    if m:
        return {'min': None, 'min_op': None, 'max': num(m.group(2)), 'max_op': m.group(1)}
    m = re.search(r'(>|≥)\s*' + NUM, t)
    if m:
        return {'min': num(m.group(2)), 'min_op': m.group(1), 'max': None, 'max_op': None}
    m = re.search(NUM, t)
    if m:
        v = num(m.group(1))
        return {'min': v, 'min_op': '≥', 'max': v, 'max_op': '≤'}
    return None


def parse_concentration(text):
    """'100' -> exactly 100; '5 < C ≤ 38' -> bounds with operators; '> 38', '≥ 20%' one-sided."""
    if not text:
        return None
    t = text.replace(',', '.').replace('%', '').replace('*', '')
    m = re.search(NUM + r'\s*(<|≤)\s*C\s*(<|≤)\s*' + NUM, t)
    if m:
        return {'min': num(m.group(1)), 'min_op': '>' if m.group(2) == '<' else '≥',
                'max': num(m.group(4)), 'max_op': m.group(3)}
    m = re.search(r'(<|≤)\s*' + NUM, t)
    if m:
        return {'min': None, 'min_op': None, 'max': num(m.group(2)), 'max_op': m.group(1)}
    m = re.search(r'(>|≥)\s*' + NUM, t)
    if m:
        return {'min': num(m.group(2)), 'min_op': m.group(1), 'max': None, 'max_op': None}
    m = re.fullmatch(r'\s*' + NUM + r'\s*', t)
    if m:
        v = num(m.group(1))
        return {'min': v, 'min_op': '=', 'max': v, 'max_op': '='}
    return None


def read(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    records = []
    sheets = {ws.title.strip(): ws for ws in wb.worksheets}
    for name in SHEETS:
        carry = {}
        family_seen = None
        for n, row in enumerate(sheets[name].iter_rows(values_only=True), start=1):
            if n <= 3 or len(row) <= COL['un_pictograms']:
                continue
            cell = lambda key: row[COL[key]]
            if not (cell('category') and cell('family') and (cell('clp_class') or cell('clp_h'))):
                continue
            family = clean(cell('family'))
            if family != family_seen:
                carry, family_seen = {}, family
            # Rows without their own CAS/EC/name continue the previous substance of the family.
            for key in ('ingredient', 'cas', 'ec', 'chemical_name', 'carbon_chain'):
                value = clean(cell(key))
                if value is not None:
                    if key == 'cas':
                        carry = {}
                    carry[key] = value
            rec = {'sheet': name, 'row': n, 'category': clean(cell('category')), 'family': family,
                   'changed': clean(cell('change')),
                   'ingredient': carry.get('ingredient'), 'cas_raw': carry.get('cas'),
                   'ec_raw': carry.get('ec'), 'chemical_name': carry.get('chemical_name'),
                   'carbon_chain_raw': carry.get('carbon_chain'),
                   'eo_po_raw': clean(cell('eo_po')), 'form': clean(cell('form')),
                   'concentration_raw': clean(cell('concentration')), 'others': clean(cell('others')),
                   'inherited_identity': clean(cell('cas')) is None}
            rec.update(parse_cas_cell(rec['cas_raw']))
            rec['ec_list'] = re.findall(r'\d{3}-\d{3}-\d', re.sub(r'\([^)]*\)', ' ', rec['ec_raw'] or ''))
            rec['carbon_chain'] = dict(zip(('min', 'max'), parse_carbon_chain(rec['carbon_chain_raw'])))
            rec['eo_po'] = parse_eo_po(rec['eo_po_raw'])
            rec['concentration'] = parse_concentration(rec['concentration_raw'])
            for system, prefix in (('clp', 'clp'), ('un_ghs', 'un')):
                rec[system] = {'class_text': keep_lines(cell(prefix + '_class')),
                               'h_text': keep_lines(cell(prefix + '_h')),
                               'signal_word': clean(cell(prefix + '_signal')),
                               'pictograms': keep_lines(cell(prefix + '_pictograms'))}
            records.append(rec)
    return records


if __name__ == '__main__':
    out = read(sys.argv[1])
    json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('records', len(out))
