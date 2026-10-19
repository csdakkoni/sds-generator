# Ek-6 source file

`apps/web/public/ek6/sea-ek6-substances.json` is generated from the official SEA Ek-6 Word file
(mevzuat.gov.tr, 7.5.19108-Ek.doc). Steps:

1. `python3 doc2txt.py Ek.doc > ek.txt` extracts the text (OLE piece table, needs `olefile`).
2. Cut the text at the Ek-6 heading and run `python3 parse_table3.py ek6.txt parsed.json`.
3. `python3 build_public_json.py parsed.json <current public json> <out.json>`.

The classification fields (class H codes, label pictograms, signal word, label H codes, EUH
codes) are kept as source in the JSON only. They are not written to the database; structured
classification rows need KDU review first.
