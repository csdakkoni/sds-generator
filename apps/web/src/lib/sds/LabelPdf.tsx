import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { SdsLanguage } from './content';
import type { LabelData } from './label';

const s = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 8, padding: 18, color: '#111' },
  frame: { flex: 1, borderWidth: 1.5, borderColor: '#111', padding: 12, gap: 8 },
  draft: { fontSize: 7, color: '#b91c1c', fontWeight: 'bold' },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  product: { fontSize: 15, fontWeight: 'bold' },
  contains: { marginTop: 2 },
  signal: { fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
  pictograms: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pictogram: { width: 62, height: 62 },
  columns: { flexDirection: 'row', gap: 14, flex: 1 },
  column: { flex: 1, gap: 2 },
  heading: { fontWeight: 'bold', marginTop: 2, marginBottom: 1 },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.75,
    borderTopColor: '#999',
    paddingTop: 5,
    gap: 12,
  },
});

const T: Record<SdsLanguage, Record<string, string>> = {
  tr: {
    contains: 'İçerir',
    hazard: 'Tehlike ifadeleri',
    precautionary: 'Önlem ifadeleri',
    supplemental: 'Ek bilgiler',
    supplier: 'Tedarikçi',
    emergency: 'Acil durum telefonu',
    draft: 'TASLAK · SDS henüz KDU onaylı değil',
    none: 'Sınıflandırılmamıştır.',
    incomplete: 'Sınıflandırma tamamlanmadı: eksik veri var. Bu etiket kullanılamaz.',
  },
  en: {
    contains: 'Contains',
    hazard: 'Hazard statements',
    precautionary: 'Precautionary statements',
    supplemental: 'Supplemental information',
    supplier: 'Supplier',
    emergency: 'Emergency telephone',
    draft: 'DRAFT · SDS not yet approved by the KDU',
    none: 'Not classified.',
    incomplete: 'Classification incomplete: data missing. This label cannot be used.',
  },
};

/** One A5 landscape GHS label; it only lays out `labelData`, it decides nothing. */
export function LabelPdf({
  data,
  lang,
  draft,
  assetBase,
}: {
  data: LabelData;
  lang: SdsLanguage;
  draft: boolean;
  assetBase: string;
}) {
  const t = T[lang];
  return (
    <Document title={`${data.productName} – ${lang === 'tr' ? 'Etiket' : 'Label'}`} language={lang}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          {draft && <Text style={s.draft}>{t.draft}</Text>}
          <View style={s.top}>
            <View style={{ flex: 1 }}>
              <Text style={s.product}>{data.productName}</Text>
              {data.contains.length > 0 && (
                <Text style={s.contains}>
                  {t.contains}: {data.contains.join(', ')}
                </Text>
              )}
            </View>
            {data.signalWord && <Text style={s.signal}>{data.signalWord}</Text>}
          </View>
          {data.pictograms.length > 0 && (
            <View style={s.pictograms}>
              {data.pictograms.map((code) => (
                <Image key={code} style={s.pictogram} src={`${assetBase}ghs/${code}.png`} />
              ))}
            </View>
          )}
          <View style={s.columns}>
            <View style={s.column}>
              <Text style={s.heading}>{t.hazard}</Text>
              {data.hazard.length === 0 &&
                (data.complete ? (
                  <Text>{t.none}</Text>
                ) : (
                  <Text style={s.draft}>{t.incomplete}</Text>
                ))}
              {data.hazard.map((h) => (
                <Text key={h}>{h}</Text>
              ))}
              {data.supplemental.length > 0 && <Text style={s.heading}>{t.supplemental}</Text>}
              {data.supplemental.map((h) => (
                <Text key={h}>{h}</Text>
              ))}
            </View>
            {data.precautionary.length > 0 && (
              <View style={s.column}>
                <Text style={s.heading}>{t.precautionary}</Text>
                {data.precautionary.map((p) => (
                  <Text key={p}>{p}</Text>
                ))}
              </View>
            )}
          </View>
          <View style={s.bottom}>
            <Text>
              {t.supplier}: {data.supplier.join(' · ')}
            </Text>
            {data.emergency && (
              <Text>
                {t.emergency}: {data.emergency}
              </Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}
