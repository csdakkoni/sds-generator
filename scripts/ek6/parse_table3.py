import re, sys, json
text = open(sys.argv[1], encoding='utf-8').read()
body = text[text.index('Liste No'):]
IDX = re.compile(r'(?<![\d-])(\d{3}-\d{3}-\d{2}-[\dX])(?![\d-])')
# A number cell holds digits, dashes, group markers like [1], and "-" or "_" placeholders.
EC = re.compile(r'^[-_\d\[\] ]+$')
CAS = re.compile(r'^[-_\d\[\] ]+$')
ONE_EC = re.compile(r'\d{3}-\d{3}-\d')
ONE_CAS = re.compile(r'\d{2,7}-\d{2}-\d')
PICT = re.compile(r'\bGHS\d{2}\b')
SIG = re.compile(r'\b(Thl|Dkt)\b')
H = re.compile(r'\b(H\d{3}(?:[A-Za-z]{1,2})?)\b')
EUH = re.compile(r'\b(EUH\d{3}[A-Za-z]?)\b')
parts = IDX.split(body)
out = []
for k in range(1, len(parts), 2):
    idx, chunk = parts[k], parts[k + 1]
    cells = [re.sub(r'\s+', ' ', c).strip() for c in chunk.split('|')]
    # Columns after the index: name_en | name_tr | note | EC | CAS | classification | class H | pictogram+signal | label H | EUH ...
    rec = {'index': idx, 'ec': None, 'cas': None, 'layout': None}
    pos = None
    if len(cells) > 6 and (EC.match(cells[4]) or cells[4] == '') and CAS.match(cells[5]):
        pos = 4; rec['layout'] = 'fixed'
    else:
        # Fallback: first EC-or-dash cell followed by a CAS-or-dash cell, after the two name columns.
        for i in range(3, min(len(cells) - 1, 9)):
            if EC.match(cells[i]) and CAS.match(cells[i + 1]):
                pos = i; rec['layout'] = 'scan'; break
    if pos is not None:
        ec, cas = cells[pos], cells[pos + 1]
        # Source text kept as written: the "Notlar" cell (letters such as A, C, J, P) and the
        # last column (special concentration limits, M-factors, ATEs). Not interpreted here.
        rec['note'] = cells[pos - 1] if pos >= 1 else ''
        rec['scl_m_text'] = cells[pos + 7] if len(cells) > pos + 7 else ''
        # A group entry lists several numbered substances; their numbers are kept as lists.
        rec['ec_list'] = ONE_EC.findall(ec)
        rec['cas_list'] = ONE_CAS.findall(cas)
        rec['ec'] = rec['ec_list'][0] if len(rec['ec_list']) == 1 and '[' not in ec else None
        rec['cas'] = rec['cas_list'][0] if len(rec['cas_list']) == 1 and '[' not in cas else None
        after = cells[pos + 2:pos + 7]
        if len(after) >= 4:
            rec['classification'] = after[0]
            rec['class_h'] = H.findall(after[1])
            rec['label_pictograms'] = PICT.findall(after[2])
            rec['signal_word'] = (SIG.findall(after[2]) or [None])[0]
            rec['label_h'] = H.findall(after[3])
            rec['euh'] = EUH.findall(after[4]) if len(after) > 4 else []
    out.append(rec)
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
