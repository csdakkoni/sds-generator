import struct, sys, olefile

ole = olefile.OleFileIO(sys.argv[1])
wd = ole.openstream('WordDocument').read()
flags = struct.unpack_from('<H', wd, 0x0A)[0]
table_name = '1Table' if flags & 0x0200 else '0Table'
tbl = ole.openstream(table_name).read()
fc_clx, lcb_clx = struct.unpack_from('<II', wd, 0x1A2)
clx = tbl[fc_clx:fc_clx + lcb_clx]

i = 0
while clx[i] == 0x01:
    cb = struct.unpack_from('<H', clx, i + 1)[0]
    i += 3 + cb
assert clx[i] == 0x02, 'piece table not found'
lcb = struct.unpack_from('<I', clx, i + 1)[0]
plc = clx[i + 5:i + 5 + lcb]
n = (lcb - 4) // 12
cps = struct.unpack_from('<%dI' % (n + 1), plc, 0)

out = []
for k in range(n):
    pcd = plc[4 * (n + 1) + 8 * k: 4 * (n + 1) + 8 * (k + 1)]
    fc = struct.unpack_from('<I', pcd, 2)[0]
    count = cps[k + 1] - cps[k]
    if fc & 0x40000000:
        off = (fc & 0x3FFFFFFF) // 2
        raw = wd[off:off + count]
        out.append(raw.decode('cp1252', errors='replace'))
    else:
        raw = wd[fc:fc + 2 * count]
        out.append(raw.decode('utf-16-le', errors='replace'))

text = ''.join(out)
text = text.replace('\x07', ' | ').replace('\r', '\n').replace('\x0b', '\n').replace('\x0c', '\n\n')
sys.stdout.write(text)
