import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Section } from './text';
import { DOCUMENT_TITLE, SECTION_WORD } from './text';
import type { SdsLanguage } from './content';

/** Fonts with Turkish glyphs; `assetBase` is where /fonts and /ghs are served from. */
export function registerFonts(assetBase: string) {
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: `${assetBase}fonts/Roboto-Regular.ttf` },
      { src: `${assetBase}fonts/Roboto-Bold.ttf`, fontWeight: 'bold' },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 8.5,
    paddingTop: 70,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: '#111',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 36,
    right: 36,
    borderBottomWidth: 1,
    borderBottomColor: '#999',
    paddingBottom: 6,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  docTitle: { fontSize: 12, fontWeight: 'bold' },
  small: { fontSize: 7.5, color: '#444' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#666',
  },
  sectionTitle: {
    backgroundColor: '#e5e7eb',
    fontWeight: 'bold',
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 3,
  },
  label: { fontWeight: 'bold', marginTop: 3 },
  text: { marginBottom: 2 },
  missing: { color: '#b91c1c', fontWeight: 'bold', marginBottom: 2 },
  table: { borderWidth: 0.5, borderColor: '#999', marginVertical: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  headRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
  },
  cell: { flex: 1, padding: 2.5 },
  pictograms: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  pictogram: { width: 48, height: 48 },
});

export interface PdfMeta {
  lang: SdsLanguage;
  productName: string;
  documentNumber: string;
  revisionNumber: number;
  date: string;
  /** Shown as a watermark line until the revision is approved. */
  draft: boolean;
  assetBase: string;
}

export function SdsPdf({ meta, sections }: { meta: PdfMeta; sections: Section[] }) {
  const tr = meta.lang === 'tr';
  return (
    <Document title={`${DOCUMENT_TITLE[meta.lang]} – ${meta.productName}`} language={meta.lang}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <View style={s.headerRow}>
            <Text style={s.docTitle}>{DOCUMENT_TITLE[meta.lang]}</Text>
            <Text style={s.small}>
              {tr ? 'Doküman no' : 'Document no'}: {meta.documentNumber}
            </Text>
          </View>
          <View style={s.headerRow}>
            <Text style={{ fontWeight: 'bold' }}>{meta.productName}</Text>
            <Text style={s.small}>
              {tr ? 'Revizyon' : 'Revision'} {meta.revisionNumber} · {meta.date}
            </Text>
          </View>
          <Text style={s.small}>
            {tr
              ? 'KKDİK Yönetmeliği Ek-2 uyarınca'
              : 'In accordance with Annex II of the KKDİK Regulation'}
            {meta.draft
              ? tr
                ? ' · TASLAK, KDU onayı bekliyor'
                : ' · DRAFT, awaiting KDU approval'
              : ''}
          </Text>
        </View>
        {sections.map((section) => (
          <View key={section.number}>
            <Text style={s.sectionTitle} minPresenceAhead={40}>
              {SECTION_WORD[meta.lang]} {section.number}: {section.title}
            </Text>
            {section.blocks.map((b, i) => {
              switch (b.kind) {
                case 'text':
                  return b.label ? (
                    <Text key={i} style={s.text}>
                      <Text style={s.label}>{b.label}</Text>
                      {b.text ? `: ${b.text}` : ''}
                    </Text>
                  ) : (
                    <Text key={i} style={s.text}>
                      {b.text}
                    </Text>
                  );
                case 'missing':
                  return (
                    <Text key={i} style={s.missing}>
                      [{b.text}]
                    </Text>
                  );
                case 'pictograms':
                  return (
                    <View key={i} style={s.pictograms}>
                      {b.codes.map((code) => (
                        <Image
                          key={code}
                          style={s.pictogram}
                          src={`${meta.assetBase}ghs/${code}.png`}
                        />
                      ))}
                    </View>
                  );
                case 'table':
                  return (
                    <View key={i} style={s.table} wrap={false}>
                      <View style={s.headRow}>
                        {b.head.map((h) => (
                          <Text key={h} style={[s.cell, { fontWeight: 'bold' }]}>
                            {h}
                          </Text>
                        ))}
                      </View>
                      {b.rows.map((row, r) => (
                        <View key={r} style={s.row}>
                          {row.map((cell, c) => (
                            <Text key={c} style={s.cell}>
                              {cell}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  );
              }
            })}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>
            {meta.productName} · {meta.documentNumber}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${tr ? 'Sayfa' : 'Page'} ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
