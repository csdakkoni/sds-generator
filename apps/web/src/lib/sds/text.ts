/**
 * The 16 SDS sections (KKDİK Annex II) in Turkish or English, built from a revision's
 * content. Hazards come only from the engine result; this file words them and never decides
 * them (CLAUDE.md rule 1). Default texts depend on the product's hazards, so nothing
 * unrelated to the product is printed (rule 12); the KDU can rewrite every default.
 */
import type { HazardClassId, Pictogram } from '@sds/classification-engine';
import { phrase, type SdsContent, type SdsLanguage, type SectionTextKey } from './content';

export type Block =
  | { kind: 'text'; label?: string; text: string }
  | { kind: 'missing'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'pictograms'; codes: Pictogram[] };

export interface Section {
  number: number;
  title: string;
  blocks: Block[];
}

export interface RevisionInfo {
  documentNumber: string;
  revisionNumber: number;
  /** ISO date of the revision; the issue date shown on the document. */
  date: string;
  approvedBy: string | null;
  changedSections: number[];
}

const TITLES: Record<SdsLanguage, string[]> = {
  tr: [
    'Madde/Karışımın ve Şirketin/İş Sahibinin Tanıtımı',
    'Zararlılık Tanımlanması',
    'Bileşimi/İçindekiler Hakkında Bilgi',
    'İlk Yardım Önlemleri',
    'Yangınla Mücadele Önlemleri',
    'Kaza Sonucu Yayılmaya Karşı Önlemler',
    'Elleçleme ve Depolama',
    'Maruz Kalma Kontrolleri/Kişisel Korunma',
    'Fiziksel ve Kimyasal Özellikler',
    'Kararlılık ve Tepkime',
    'Toksikolojik Bilgiler',
    'Ekolojik Bilgiler',
    'Bertaraf Etme Bilgileri',
    'Taşımacılık Bilgisi',
    'Mevzuat Bilgisi',
    'Diğer Bilgiler',
  ],
  en: [
    'Identification of the substance/mixture and of the company/undertaking',
    'Hazards identification',
    'Composition/information on ingredients',
    'First aid measures',
    'Firefighting measures',
    'Accidental release measures',
    'Handling and storage',
    'Exposure controls/personal protection',
    'Physical and chemical properties',
    'Stability and reactivity',
    'Toxicological information',
    'Ecological information',
    'Disposal considerations',
    'Transport information',
    'Regulatory information',
    'Other information',
  ],
};

export const DOCUMENT_TITLE: Record<SdsLanguage, string> = {
  tr: 'GÜVENLİK BİLGİ FORMU',
  en: 'SAFETY DATA SHEET',
};

export const SECTION_WORD: Record<SdsLanguage, string> = { tr: 'BÖLÜM', en: 'SECTION' };

const CLASS_NAMES: Record<SdsLanguage, Record<HazardClassId, string>> = {
  tr: {
    flammable_liquid: 'Alevlenir sıvılar',
    metal_corrosion: 'Metalleri aşındırıcı',
    acute_toxicity_oral: 'Akut toksisite (ağız)',
    acute_toxicity_dermal: 'Akut toksisite (deri)',
    acute_toxicity_inhalation: 'Akut toksisite (soluma)',
    skin_corrosion_irritation: 'Cilt aşınması/tahrişi',
    eye_damage_irritation: 'Ciddi göz hasarı/göz tahrişi',
    respiratory_sensitisation: 'Solunum yolu hassasiyeti',
    skin_sensitisation: 'Cilt hassasiyeti',
    germ_cell_mutagenicity: 'Eşey hücre mutajenitesi',
    carcinogenicity: 'Kanserojenite',
    reproductive_toxicity: 'Üreme sistemi toksisitesi',
    lactation: 'Emzirme üzerinden etkiler',
    stot_single: 'Belirli hedef organ toksisitesi (tek maruz kalma)',
    stot_repeated: 'Belirli hedef organ toksisitesi (tekrarlı maruz kalma)',
    aspiration: 'Aspirasyon tehlikesi',
    aquatic_acute: 'Sucul ortam için tehlikeli (akut)',
    aquatic_chronic: 'Sucul ortam için tehlikeli (kronik)',
  },
  en: {
    flammable_liquid: 'Flammable liquids',
    metal_corrosion: 'Corrosive to metals',
    acute_toxicity_oral: 'Acute toxicity (oral)',
    acute_toxicity_dermal: 'Acute toxicity (dermal)',
    acute_toxicity_inhalation: 'Acute toxicity (inhalation)',
    skin_corrosion_irritation: 'Skin corrosion/irritation',
    eye_damage_irritation: 'Serious eye damage/eye irritation',
    respiratory_sensitisation: 'Respiratory sensitisation',
    skin_sensitisation: 'Skin sensitisation',
    germ_cell_mutagenicity: 'Germ cell mutagenicity',
    carcinogenicity: 'Carcinogenicity',
    reproductive_toxicity: 'Reproductive toxicity',
    lactation: 'Effects on or via lactation',
    stot_single: 'Specific target organ toxicity (single exposure)',
    stot_repeated: 'Specific target organ toxicity (repeated exposure)',
    aspiration: 'Aspiration hazard',
    aquatic_acute: 'Hazardous to the aquatic environment (acute)',
    aquatic_chronic: 'Hazardous to the aquatic environment (chronic)',
  },
};

const MEASUREMENT_NAMES: Record<SdsLanguage, Record<string, string>> = {
  tr: {
    physical_state: 'Fiziksel hâl',
    flash_point: 'Parlama noktası',
    boiling_point: 'Kaynama başlangıç noktası',
    ph: 'pH',
    kinematic_viscosity_40c: 'Kinematik viskozite (40 °C)',
    metal_corrosion: 'Metallere karşı aşındırıcılık (UN C.1)',
  },
  en: {
    physical_state: 'Physical state',
    flash_point: 'Flash point',
    boiling_point: 'Initial boiling point',
    ph: 'pH',
    kinematic_viscosity_40c: 'Kinematic viscosity (40 °C)',
    metal_corrosion: 'Corrosive to metals (UN C.1)',
  },
};

const VALUE_WORDS: Record<SdsLanguage, Record<string, string>> = {
  tr: { liquid: 'Sıvı', solid: 'Katı', gas: 'Gaz', positive: 'Pozitif', negative: 'Negatif' },
  en: { liquid: 'Liquid', solid: 'Solid', gas: 'Gas', positive: 'Positive', negative: 'Negative' },
};

const MISSING: Record<SdsLanguage, string> = { tr: 'Tamamlanmalı', en: 'To be completed' };

/** Which kinds of hazard the product has, as far as the default texts need to know. */
function hazards(content: SdsContent) {
  const cats = content.result.classifications.map((c) => c.category as string);
  const has = (prefix: string) => cats.some((c) => c.startsWith(prefix));
  const classes = new Set(content.result.classifications.map((c) => c.hazardClass));
  const h = new Set(content.result.label.hStatements);
  return {
    flammable: classes.has('flammable_liquid'),
    metalCorrosive: classes.has('metal_corrosion'),
    skinCorrosive: has('Skin Corr.'),
    skinIrritant: has('Skin Irrit.') || has('Skin Sens.'),
    eyeDamage: has('Eye Dam.') || has('Skin Corr.'),
    eyeIrritant: has('Eye Irrit.'),
    oralToxic: classes.has('acute_toxicity_oral'),
    inhalationHazard:
      classes.has('acute_toxicity_inhalation') ||
      classes.has('respiratory_sensitisation') ||
      h.has('H335') ||
      h.has('H336'),
    aspiration: classes.has('aspiration'),
    aquatic: classes.has('aquatic_acute') || classes.has('aquatic_chronic'),
  };
}

/** Default wording of a free-text part, chosen from the product's hazards. */
export function defaultSectionText(
  content: SdsContent,
  lang: SdsLanguage,
  key: SectionTextKey,
): string {
  const hz = hazards(content);
  const tr = lang === 'tr';
  const lines: string[] = [];
  const add = (condition: boolean, trText: string, enText: string) => {
    if (condition) lines.push(tr ? trText : enText);
  };

  switch (key) {
    case 's2_3':
    case 's8_1':
      // No safe default: PBT/vPvB status and exposure limits must come from the KDU.
      return '';
    case 's4':
      add(
        true,
        '4.1 Belirtiler sürerse veya şüphe durumunda tıbbi yardım alın ve bu formu gösterin.',
        '4.1 If symptoms persist or in case of doubt, get medical advice and show this safety data sheet.',
      );
      add(
        true,
        `Solunması halinde: Kişiyi temiz havaya çıkarın ve rahat nefes alabileceği bir pozisyonda tutun.${hz.inhalationHazard ? ' Kendinizi iyi hissetmezseniz tıbbi yardım alın.' : ''}`,
        `If inhaled: Remove person to fresh air and keep comfortable for breathing.${hz.inhalationHazard ? ' Get medical help if you feel unwell.' : ''}`,
      );
      if (hz.skinCorrosive) {
        add(
          true,
          'Ciltle temas halinde: Kirlenmiş giysileri hemen çıkarın. Cildi bol suyla en az 15 dakika yıkayın. Hemen tıbbi yardım alın.',
          'If on skin: Take off immediately all contaminated clothing. Rinse skin with plenty of water for at least 15 minutes. Get immediate medical help.',
        );
      } else if (hz.skinIrritant) {
        add(
          true,
          'Ciltle temas halinde: Kirlenmiş giysileri çıkarın. Cildi bol su ve sabunla yıkayın. Cilt tahrişi veya döküntü olursa tıbbi yardım alın.',
          'If on skin: Take off contaminated clothing. Wash with plenty of soap and water. If skin irritation or rash occurs, get medical help.',
        );
      } else {
        add(
          true,
          'Ciltle temas halinde: Cildi su ve sabunla yıkayın.',
          'If on skin: Wash with soap and water.',
        );
      }
      if (hz.eyeDamage) {
        add(
          true,
          'Gözle temas halinde: Birkaç dakika boyunca suyla dikkatlice durulayın. Varsa ve kolayca yapılabiliyorsa kontakt lensleri çıkarın. Durulamaya devam edin. Hemen tıbbi yardım alın.',
          'If in eyes: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing. Get immediate medical help.',
        );
      } else if (hz.eyeIrritant) {
        add(
          true,
          'Gözle temas halinde: Birkaç dakika boyunca suyla dikkatlice durulayın. Varsa ve kolayca yapılabiliyorsa kontakt lensleri çıkarın. Göz tahrişi sürerse tıbbi yardım alın.',
          'If in eyes: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. If eye irritation persists, get medical help.',
        );
      } else {
        add(
          true,
          'Gözle temas halinde: Gözü bol suyla durulayın.',
          'If in eyes: Rinse with plenty of water.',
        );
      }
      if (hz.skinCorrosive || hz.aspiration) {
        add(
          true,
          'Yutulması halinde: Ağzı çalkalayın. Kusturmayın. Hemen tıbbi yardım alın.',
          'If swallowed: Rinse mouth. Do NOT induce vomiting. Get immediate medical help.',
        );
      } else if (hz.oralToxic) {
        add(
          true,
          'Yutulması halinde: Ağzı çalkalayın. Hemen Ulusal Zehir Danışma Merkezini (114) veya doktoru arayın.',
          'If swallowed: Rinse mouth. Immediately call the National Poison Information Centre (114) or a doctor.',
        );
      } else {
        add(
          true,
          'Yutulması halinde: Ağzı suyla çalkalayın. Kendinizi iyi hissetmezseniz tıbbi yardım alın.',
          'If swallowed: Rinse mouth with water. Get medical help if you feel unwell.',
        );
      }
      add(
        true,
        "4.2 Önemli belirtiler ve etkiler için Bölüm 2 ve 11'e bakınız.",
        '4.2 For the most important symptoms and effects see sections 2 and 11.',
      );
      add(true, '4.3 Belirtilere göre tedavi edin.', '4.3 Treat symptomatically.');
      return lines.join('\n');
    case 's5':
      add(
        true,
        '5.1 Uygun söndürücüler: Su spreyi, alkole dayanıklı köpük, kuru kimyasal toz veya karbondioksit. Uygun olmayan söndürücü: Tam su jeti.',
        '5.1 Suitable extinguishing media: Water spray, alcohol-resistant foam, dry chemical powder or carbon dioxide. Unsuitable: Full water jet.',
      );
      add(
        true,
        '5.2 Yanma sırasında karbon oksitler gibi tehlikeli gazlar oluşabilir.',
        '5.2 Hazardous gases such as carbon oxides may form in a fire.',
      );
      add(
        hz.flammable,
        'Buharlar havayla patlayıcı karışım oluşturabilir. Yangına maruz kalan kapları su spreyiyle soğutun.',
        'Vapours may form explosive mixtures with air. Cool containers exposed to fire with water spray.',
      );
      add(
        true,
        '5.3 Bağımsız solunum cihazı ve koruyucu giysi kullanın.',
        '5.3 Wear self-contained breathing apparatus and protective clothing.',
      );
      return lines.join('\n');
    case 's6':
      add(
        true,
        "6.1 Yeterli havalandırma sağlayın. Bölüm 8'de belirtilen kişisel koruyucu donanımı kullanın.",
        '6.1 Ensure adequate ventilation. Use the personal protective equipment given in section 8.',
      );
      add(
        hz.flammable,
        'Tüm tutuşturma kaynaklarını uzaklaştırın.',
        'Remove all sources of ignition.',
      );
      add(
        true,
        hz.aquatic
          ? '6.2 Kanalizasyona, yüzey ve yeraltı sularına karışmasını önleyin. Çevreye karışırsa yetkili makamları bilgilendirin.'
          : '6.2 Kanalizasyona ve su ortamına karışmasını önleyin.',
        hz.aquatic
          ? '6.2 Prevent entry into drains, surface water and groundwater. Inform the authorities if the product reaches the environment.'
          : '6.2 Prevent entry into drains and watercourses.',
      );
      add(
        true,
        "6.3 Sıvı döküntüleri inert emici malzeme (kum, diyatomit, üniversal bağlayıcı) ile toplayın ve Bölüm 13'e göre bertaraf edin.",
        '6.3 Absorb liquid spills with inert material (sand, diatomaceous earth, universal binder) and dispose of according to section 13.',
      );
      add(true, "6.4 Bölüm 8 ve 13'e bakınız.", '6.4 See sections 8 and 13.');
      return lines.join('\n');
    case 's7':
      add(
        true,
        '7.1 Göz ve ciltle temastan kaçının. Kullanırken yemek yemeyin, içmeyin veya sigara içmeyin. Çalışma alanını iyi havalandırın.',
        '7.1 Avoid contact with eyes and skin. Do not eat, drink or smoke when using this product. Ensure good ventilation of the work area.',
      );
      add(
        hz.flammable,
        'Isıdan, sıcak yüzeylerden, kıvılcımdan, açık alevden ve diğer tutuşturma kaynaklarından uzak tutun. Statik boşalmaya karşı önlem alın.',
        'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. Take precautionary measures against static discharge.',
      );
      add(
        true,
        '7.2 Orijinal kabında, sıkıca kapalı olarak, serin ve iyi havalandırılan bir yerde saklayın.',
        '7.2 Store in the original container, tightly closed, in a cool and well-ventilated place.',
      );
      add(
        hz.metalCorrosive,
        'Korozyona dayanıklı kapta saklayın.',
        'Store in a corrosion-resistant container.',
      );
      add(true, "7.3 Bölüm 1.2'deki kullanımlar.", '7.3 See the uses in section 1.2.');
      return lines.join('\n');
    case 's8_2':
      add(
        true,
        'Mühendislik kontrolleri: Yeterli genel ve lokal havalandırma sağlayın.',
        'Engineering controls: Ensure adequate general and local exhaust ventilation.',
      );
      add(
        true,
        hz.eyeDamage
          ? 'Göz/yüz koruması: Yan korumalı, sıkı kapanan koruyucu gözlük veya yüz siperi (EN 166).'
          : hz.eyeIrritant
            ? 'Göz/yüz koruması: Yan korumalı koruyucu gözlük (EN 166).'
            : 'Göz/yüz koruması: Sıçrama riski varsa koruyucu gözlük (EN 166).',
        hz.eyeDamage
          ? 'Eye/face protection: Tightly fitting safety goggles with side shields or a face shield (EN 166).'
          : hz.eyeIrritant
            ? 'Eye/face protection: Safety glasses with side shields (EN 166).'
            : 'Eye/face protection: Safety glasses if there is a risk of splashing (EN 166).',
      );
      add(
        true,
        'El koruması: Kimyasallara dayanıklı koruyucu eldiven (EN ISO 374). Eldiven malzemesi ve dayanım süresi eldiven üreticisiyle doğrulanmalıdır.',
        'Hand protection: Chemical-resistant protective gloves (EN ISO 374). Confirm the glove material and breakthrough time with the glove manufacturer.',
      );
      add(
        true,
        hz.skinCorrosive
          ? 'Vücut koruması: Kimyasallara dayanıklı koruyucu giysi.'
          : 'Vücut koruması: Uygun iş giysisi.',
        hz.skinCorrosive
          ? 'Body protection: Chemical-resistant protective clothing.'
          : 'Body protection: Suitable work clothing.',
      );
      add(
        true,
        hz.inhalationHazard
          ? 'Solunum koruması: Yetersiz havalandırmada uygun filtreli solunum koruyucu kullanın (EN 14387).'
          : 'Solunum koruması: Yeterli havalandırmada gerekli değildir. Buhar veya sis oluşursa uygun filtreli maske kullanın.',
        hz.inhalationHazard
          ? 'Respiratory protection: With insufficient ventilation wear a respirator with a suitable filter (EN 14387).'
          : 'Respiratory protection: Not required with adequate ventilation. Use a mask with a suitable filter if vapour or mist forms.',
      );
      add(
        hz.aquatic,
        'Çevresel maruz kalma: Çevreye salınmasını önleyin.',
        'Environmental exposure: Avoid release to the environment.',
      );
      return lines.join('\n');
    case 's10':
      add(
        true,
        '10.1 Normal kullanım koşullarında bilinen tehlikeli bir tepkimesi yoktur.\n10.2 Önerilen depolama ve elleçleme koşullarında kararlıdır.\n10.3 Normal koşullarda tehlikeli tepkime beklenmez.\n10.4 Aşırı sıcaklık ve doğrudan güneş ışığından kaçının.\n10.5 Kuvvetli oksitleyiciler.\n10.6 Normal kullanımda tehlikeli bozunma ürünü beklenmez.',
        '10.1 No hazardous reactions known under normal conditions of use.\n10.2 Stable under the recommended storage and handling conditions.\n10.3 No hazardous reactions expected under normal conditions.\n10.4 Avoid excessive heat and direct sunlight.\n10.5 Strong oxidising agents.\n10.6 No hazardous decomposition products expected under normal use.',
      );
      add(
        hz.flammable,
        'Isı, kıvılcım ve açık alevden kaçının.',
        'Avoid heat, sparks and open flames.',
      );
      return lines.join('\n');
    case 's13':
      add(
        true,
        "13.1 Ürün ve ambalaj atıkları Atık Yönetimi Yönetmeliği'ne ve yerel düzenlemelere uygun olarak lisanslı bir tesiste bertaraf edilmelidir. Kanalizasyona dökülmemelidir. Boş ambalajlar Ambalaj Atıklarının Kontrolü Yönetmeliği'ne göre değerlendirilmelidir.",
        '13.1 Dispose of product and packaging waste at a licensed facility in accordance with the waste management regulation and local rules. Do not empty into drains. Handle empty packaging in accordance with the packaging waste regulation.',
      );
      return lines.join('\n');
  }
}

const fmt = (lang: SdsLanguage, n: number) =>
  new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { maximumFractionDigits: 4 }).format(n);

function range(lang: SdsLanguage, min: number, max: number): string {
  return min === max ? `${fmt(lang, min)} %` : `${fmt(lang, min)} – ${fmt(lang, max)} %`;
}

/** ATEmix range with the smaller value first, whichever concentration bound produced it. */
function ateRange(lang: SdsLanguage, a: number | null, b: number | null, unit: string): string {
  const values = [a, b].filter((v): v is number => v !== null).sort((x, y) => x - y);
  const text = values.map((v) => fmt(lang, Math.round(v)));
  return `${text.length === 2 && text[0] !== text[1] ? text.join(' – ') : (text[0] ?? '?')} ${unit}`;
}

function statementLines(lang: SdsLanguage, codes: string[]): string[] {
  return codes.map((code) => `${code}: ${phrase(lang, code) ?? `[${MISSING[lang]}]`}`);
}

export function buildSections(
  content: SdsContent,
  lang: SdsLanguage,
  revision: RevisionInfo,
  sectionText: (key: SectionTextKey) => string,
): Section[] {
  const tr = lang === 'tr';
  const L = (trText: string, enText: string) => (tr ? trText : enText);
  const { result, inputs, company } = content;
  const label = result.label;
  const text = (key: SectionTextKey): Block[] => {
    const value = sectionText(key).trim();
    if (!value) return [{ kind: 'missing', text: MISSING[lang] }];
    return value.split('\n').map((line) => ({ kind: 'text' as const, text: line }));
  };
  const orMissing = (value: string | null | undefined): Block =>
    value?.trim() ? { kind: 'text', text: value } : { kind: 'missing', text: MISSING[lang] };

  const s1: Block[] = [
    { kind: 'text', label: L('1.1 Ürün adı', '1.1 Product name'), text: content.product.name },
    ...(content.product.code
      ? [
          {
            kind: 'text' as const,
            label: L('Ürün kodu', 'Product code'),
            text: content.product.code,
          },
        ]
      : []),
    { kind: 'text', label: L('1.2 Belirlenmiş kullanımlar', '1.2 Identified uses'), text: '' },
    orMissing(inputs.identifiedUse[lang]),
    { kind: 'text', label: L('1.3 Tedarikçi', '1.3 Supplier'), text: '' },
    orMissing(company.name),
    orMissing(company.address),
    orMissing([company.phone, company.email].filter((v) => v.trim()).join(' · ')),
    { kind: 'text', label: L('1.4 Acil durum telefonu', '1.4 Emergency telephone'), text: '' },
    orMissing(company.emergencyPhone),
    {
      kind: 'text',
      text: L(
        'Ulusal Zehir Danışma Merkezi (UZEM): 114',
        'National Poison Information Centre (UZEM), Türkiye: 114',
      ),
    },
  ];

  const s2: Block[] = [
    {
      kind: 'text',
      label: L('2.1 Sınıflandırma (SEA Yönetmeliği)', '2.1 Classification (SEA Regulation)'),
      text: '',
    },
  ];
  if (result.classifications.length === 0) {
    s2.push({
      kind: 'text',
      text: L(
        'Karışım, mevcut verilere göre SEA Yönetmeliği sınıflandırma kriterlerini karşılamamaktadır.',
        'Based on the available data the mixture does not meet the classification criteria of the SEA Regulation.',
      ),
    });
  } else {
    s2.push({
      kind: 'table',
      head: [
        L('Tehlike sınıfı', 'Hazard class'),
        L('Kategori', 'Category'),
        L('H ifadesi', 'H statement'),
      ],
      rows: result.classifications.map((c) => [
        CLASS_NAMES[lang][c.hazardClass],
        c.category,
        c.hCodes.join(', '),
      ]),
    });
  }
  s2.push({ kind: 'text', label: L('2.2 Etiket unsurları', '2.2 Label elements'), text: '' });
  if (label.pictograms.length > 0) s2.push({ kind: 'pictograms', codes: label.pictograms });
  s2.push({
    kind: 'text',
    label: L('Uyarı kelimesi', 'Signal word'),
    text:
      label.signalWord === 'danger'
        ? L('Tehlike', 'Danger')
        : label.signalWord === 'warning'
          ? L('Dikkat', 'Warning')
          : L('Gerekli değil', 'Not required'),
  });
  if (label.hStatements.length > 0) {
    s2.push({ kind: 'text', label: L('Zararlılık ifadeleri', 'Hazard statements'), text: '' });
    for (const line of statementLines(lang, label.hStatements))
      s2.push({ kind: 'text', text: line });
  }
  if (inputs.pStatements.length > 0) {
    s2.push({ kind: 'text', label: L('Önlem ifadeleri', 'Precautionary statements'), text: '' });
    for (const line of statementLines(lang, inputs.pStatements))
      s2.push({ kind: 'text', text: line });
  }
  if (label.supplemental.length > 0) {
    s2.push({ kind: 'text', label: L('Ek ifadeler', 'Supplemental statements'), text: '' });
    for (const s of label.supplemental) {
      s2.push({
        kind: 'text',
        text: `${s.code}: ${phrase(lang, s.code, s.detail) ?? `[${MISSING[lang]}]`}`,
      });
    }
  }
  s2.push({ kind: 'text', label: L('2.3 Diğer zararlar', '2.3 Other hazards'), text: '' });
  s2.push(...text('s2_3'));

  const hazardous = content.composition.filter((c) => c.classifications.length > 0);
  const s3: Block[] = [
    { kind: 'text', label: L('3.2 Karışımlar', '3.2 Mixtures'), text: '' },
    hazardous.length === 0
      ? {
          kind: 'text',
          text: L(
            'Sınıflandırılmış bileşen bulunmamaktadır.',
            'The mixture contains no classified ingredients.',
          ),
        }
      : {
          kind: 'table',
          head: [
            L('Bileşen', 'Ingredient'),
            'CAS',
            L('Oran', 'Concentration'),
            L('Sınıflandırma', 'Classification'),
          ],
          rows: hazardous.map((c) => [
            c.name,
            c.cas ?? '—',
            range(lang, c.min, c.max),
            c.classifications.map((k) => `${k.category}, ${k.hCode}`).join('; '),
          ]),
        },
  ];
  const hInSection3 = [...new Set(hazardous.flatMap((c) => c.classifications.map((k) => k.hCode)))]
    .filter((h) => /^H\d/.test(h))
    .sort();

  const s9: Block[] =
    content.measurements.length === 0
      ? [{ kind: 'missing', text: MISSING[lang] }]
      : [
          {
            kind: 'table',
            head: [L('Özellik', 'Property'), L('Değer', 'Value')],
            rows: content.measurements.map((m) => [
              MEASUREMENT_NAMES[lang][m.property] ?? m.property,
              VALUE_WORDS[lang][m.value_text] ?? `${m.value_text}${m.unit ? ` ${m.unit}` : ''}`,
            ]),
          },
        ];

  const toxClasses: HazardClassId[] = [
    'acute_toxicity_oral',
    'acute_toxicity_dermal',
    'acute_toxicity_inhalation',
    'skin_corrosion_irritation',
    'eye_damage_irritation',
    'respiratory_sensitisation',
    'skin_sensitisation',
    'germ_cell_mutagenicity',
    'carcinogenicity',
    'reproductive_toxicity',
    'stot_single',
    'stot_repeated',
    'aspiration',
  ];
  const statusText = (c: HazardClassId): string => {
    const found = result.classifications.find((k) => k.hazardClass === c);
    if (found) return `${found.category} (${found.hCodes.join(', ')})`;
    return result.classStatus[c] === 'not_classified'
      ? L(
          'Mevcut verilere göre sınıflandırma kriterlerini karşılamaz.',
          'Based on available data, the classification criteria are not met.',
        )
      : L('Veri yetersiz; sınıflandırılamadı.', 'Insufficient data; not classified.');
  };
  const s11: Block[] = [
    {
      kind: 'text',
      text: L(
        '11.1 Karışım üzerinde toksikolojik test yapılmamıştır. Değerlendirme bileşen verileriyle hesaplama yöntemine dayanır.',
        '11.1 No toxicological tests were carried out on the mixture. The assessment is based on ingredient data and the calculation method.',
      ),
    },
    {
      kind: 'table',
      head: [L('Tehlike sınıfı', 'Hazard class'), L('Sonuç', 'Result')],
      rows: toxClasses.map((c) => [CLASS_NAMES[lang][c], statusText(c)]),
    },
  ];
  const ates = result.ate.filter((a) => a.upper !== null);
  if (ates.length > 0) {
    s11.push({
      kind: 'table',
      head: [L('ATE (karışım, hesaplanmış)', 'ATE (mixture, calculated)'), L('Değer', 'Value')],
      rows: ates.map((a) => [
        {
          oral: L('Ağız', 'Oral'),
          dermal: L('Deri', 'Dermal'),
          inhalation: L('Soluma', 'Inhalation'),
        }[a.route],
        ateRange(lang, a.lower, a.upper, a.unit),
      ]),
    });
  }

  const s12: Block[] = [
    {
      kind: 'table',
      head: [L('Tehlike sınıfı', 'Hazard class'), L('Sonuç', 'Result')],
      rows: (['aquatic_acute', 'aquatic_chronic'] as const).map((c) => [
        CLASS_NAMES[lang][c],
        statusText(c),
      ]),
    },
    {
      kind: 'text',
      text: L(
        '12.2–12.6 Karışım için kalıcılık, biyobirikim, toprakta hareketlilik ve PBT/vPvB değerlendirmesine ilişkin test verisi yoktur.',
        '12.2–12.6 No test data are available for the mixture on persistence, bioaccumulation, mobility in soil or PBT/vPvB assessment.',
      ),
    },
  ];

  const t = inputs.transport;
  const s14: Block[] = t.notRegulated
    ? [
        {
          kind: 'text',
          text: L(
            'ADR/RID, IMDG ve IATA kurallarına göre tehlikeli madde değildir.',
            'Not dangerous goods according to ADR/RID, IMDG and IATA.',
          ),
        },
      ]
    : t.unNumber.trim()
      ? [
          {
            kind: 'table',
            head: [L('Bilgi', 'Item'), 'ADR/RID, IMDG, IATA'],
            rows: [
              [L('14.1 UN numarası', '14.1 UN number'), t.unNumber],
              [L('14.2 Uygun sevkiyat adı', '14.2 Proper shipping name'), t.shippingName],
              [
                L('14.3 Taşımacılık zararlılık sınıfı', '14.3 Transport hazard class'),
                t.transportClass,
              ],
              [L('14.4 Ambalaj grubu', '14.4 Packing group'), t.packingGroup || '—'],
              [
                L('14.5 Çevresel zararlar', '14.5 Environmental hazards'),
                hazards(content).aquatic ? L('Evet', 'Yes') : L('Hayır', 'No'),
              ],
            ],
          },
        ]
      : [{ kind: 'missing', text: MISSING[lang] }];

  const s15: Block[] = [
    {
      kind: 'text',
      text: L(
        '15.1 Maddelerin ve Karışımların Sınıflandırılması, Etiketlenmesi ve Ambalajlanması Hakkında Yönetmelik (SEA); Kimyasalların Kaydı, Değerlendirilmesi, İzni ve Kısıtlanması Hakkında Yönetmelik (KKDİK).',
        '15.1 Turkish Regulation on Classification, Labelling and Packaging of Substances and Mixtures (SEA); Turkish Regulation on Registration, Evaluation, Authorisation and Restriction of Chemicals (KKDİK).',
      ),
    },
    {
      kind: 'text',
      text: L(
        '15.2 Karışım için kimyasal güvenlik değerlendirmesi yapılmamıştır.',
        '15.2 No chemical safety assessment has been carried out for the mixture.',
      ),
    },
  ];

  const s16: Block[] = [
    {
      kind: 'text',
      label: L('Revizyon', 'Revision'),
      text: `${revision.revisionNumber} · ${revision.date}${
        revision.changedSections.length > 0
          ? ` · ${L('Değişen bölümler', 'Changed sections')}: ${revision.changedSections.join(', ')}`
          : ''
      }`,
    },
  ];
  if (hInSection3.length > 0) {
    s16.push({
      kind: 'text',
      label: L("Bölüm 3'teki H ifadelerinin tam metni", 'Full text of H statements in section 3'),
      text: '',
    });
    for (const line of statementLines(lang, hInSection3)) s16.push({ kind: 'text', text: line });
  }
  s16.push({
    kind: 'text',
    label: L('Sınıflandırma yöntemi', 'Classification method'),
    text: L(
      `Karışım SEA Yönetmeliği Ek I hesaplama yöntemiyle, bileşen verilerinden sınıflandırılmıştır. Konsantrasyon aralıklarında üst sınır esas alınmıştır. Fiziksel tehlikeler ölçülmüş verilere dayanır. Hesaplama sürümü ${result.engineVersion}.`,
      `The mixture was classified from ingredient data by the calculation method of SEA Regulation Annex I. The upper bound of concentration ranges was used. Physical hazards are based on measured data. Calculation version ${result.engineVersion}.`,
    ),
  });
  if (content.dataSources.length > 0) {
    s16.push({
      kind: 'table',
      head: [L('Kaynak (tedarikçi GBF)', 'Source (supplier SDS)'), L('Sürüm', 'Version')],
      rows: content.dataSources.map((d) => [`${d.rawMaterial}`, d.supplierRevision ?? '—']),
    });
  }
  s16.push({
    kind: 'text',
    label: L('Kimyasal Değerlendirme Uzmanı', 'Chemical assessment specialist (KDU)'),
    text: [
      inputs.kdu.name,
      inputs.kdu.certificateNo &&
        `${L('Sertifika no', 'Certificate no')} ${inputs.kdu.certificateNo}`,
    ]
      .filter(Boolean)
      .join(' · '),
  });
  if (!inputs.kdu.name.trim()) s16.push({ kind: 'missing', text: MISSING[lang] });

  const body: Block[][] = [
    s1,
    s2,
    s3,
    text('s4'),
    text('s5'),
    text('s6'),
    text('s7'),
    [
      { kind: 'text', label: L('8.1 Kontrol parametreleri', '8.1 Control parameters'), text: '' },
      ...text('s8_1'),
      { kind: 'text', label: L('8.2 Maruz kalma kontrolleri', '8.2 Exposure controls'), text: '' },
      ...text('s8_2'),
    ],
    s9,
    text('s10'),
    s11,
    s12,
    text('s13'),
    s14,
    s15,
    s16,
  ];
  return body.map((blocks, i) => ({
    number: i + 1,
    title: TITLES[lang][i] as string,
    blocks,
  }));
}
