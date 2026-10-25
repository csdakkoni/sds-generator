import { classifyMixture } from '@sds/classification-engine';
import { describe, expect, it } from 'vitest';
import { buildMixture } from '../mixture';
import type { Extraction } from '../types';
import {
  changedSections,
  composeContent,
  emptyInputs,
  publishBlockers,
  sameContent,
  SECTION_TEXT_KEYS,
  type SdsContent,
  type SdsLanguage,
  type SectionTextKey,
} from './content';
import { labelData } from './label';
import { buildSections, defaultSectionText } from './text';

const src = { page: 1, quote: 'x' };
const found = <T>(value: T) => ({ status: 'found' as const, value, source: src });

function extraction(category: string, hCode: string): Extraction {
  return {
    identity: {
      tradeName: found('Etken'),
      supplier: found('Tedarikçi'),
      revisionDate: found('2026'),
      revisionNumber: found('3'),
    },
    productClassification: { status: 'classified', lines: [] },
    components: [
      {
        name: found('Alkil eter'),
        cas: found('68439-49-6'),
        concentration: { min: 100, max: 100, raw: '100 %', source: src },
        classifications: [{ hazardClassAsWritten: category, category, hCode, source: src }],
      },
    ],
    physicalProperties: [],
  };
}

function content(category = 'Eye Dam. 1', hCode = 'H318', trade = 'Etken'): SdsContent {
  const water: Extraction = {
    ...extraction(category, hCode),
    components: [],
    productClassification: { status: 'not_classified', lines: [] },
  };
  const mixture = buildMixture(
    [
      { id: 'l1', raw_material_id: 'a', percent_min: 20, percent_max: 20 },
      { id: 'l2', raw_material_id: 'w', percent_min: 80, percent_max: 80 },
    ],
    [
      { id: 'a', trade_name: trade, approvedExtraction: extraction(category, hCode) },
      { id: 'w', trade_name: 'Su', approvedExtraction: water },
    ],
    [
      { property: 'physical_state', value_text: 'liquid', numeric_min: null },
      { property: 'flash_point', value_text: '101', numeric_min: 101 },
      { property: 'metal_corrosion', value_text: 'negative', numeric_min: null },
    ],
  );
  const result = classifyMixture(mixture.input);
  return composeContent({
    product: { name: 'Deneme', code: 'D-1' },
    company: { name: 'Firma', address: 'Adres', phone: '1', email: '', emergencyPhone: '2' },
    inputs: {
      ...emptyInputs(),
      pStatements: result.label.pStatementSuggestions.map((p) => p.code),
    },
    measurements: [
      { property: 'physical_state', value_text: 'liquid', unit: null },
      { property: 'flash_point', value_text: '101', unit: '°C' },
    ],
    mixture,
    result,
    dataSources: [
      { rawMaterial: 'Etken', fileName: 'e.pdf', supplierRevision: '3', approvedAt: null },
    ],
  });
}

const revision = {
  documentNumber: 'GBF-D-1',
  revisionNumber: 1,
  date: '2026-10-19',
  approvedBy: null,
  changedSections: [],
};
const defaults = (c: SdsContent, lang: SdsLanguage) => (key: SectionTextKey) =>
  defaultSectionText(c, lang, key);
const allText = (c: SdsContent, lang: SdsLanguage) =>
  buildSections(c, lang, revision, defaults(c, lang))
    .flatMap((s) => s.blocks)
    .map((b) =>
      b.kind === 'text'
        ? `${b.label ?? ''} ${b.text}`
        : b.kind === 'table'
          ? b.rows.flat().join(' ')
          : '',
    )
    .join('\n');

describe('SDS sections', () => {
  it('has the 16 sections in both languages, with hazards taken from the engine result', () => {
    const c = content();
    for (const lang of ['tr', 'en'] as const) {
      const sections = buildSections(c, lang, revision, defaults(c, lang));
      expect(sections.map((s) => s.number)).toEqual([...Array(16).keys()].map((i) => i + 1));
    }
    expect(allText(c, 'tr')).toContain('H318: Ciddi göz hasarına yol açar.');
    expect(allText(c, 'en')).toContain('H318');
  });

  it('prints substance names, never the raw material trade name', () => {
    const c = content('Eye Dam. 1', 'H318', 'TicariAdX');
    expect(c.composition.map((l) => l.name)).toContain('Alkil eter');
    for (const lang of ['tr', 'en'] as const) {
      expect(allText(c, lang)).not.toContain('TicariAdX');
    }
  });

  it('shows the EC number next to the CAS number in section 3', () => {
    const c = content();
    const [line] = c.composition;
    if (!line) throw new Error('no composition lines');
    line.ec = '231-102-5';
    const section3 = buildSections(c, 'en', revision, defaults(c, 'en')).find(
      (s) => s.number === 3,
    );
    const table = section3?.blocks.find((b) => b.kind === 'table');
    if (table?.kind !== 'table') throw new Error('section 3 has no composition table');
    expect(table.head.slice(0, 3)).toEqual(['Ingredient', 'EC', 'CAS']);
    expect(table.rows[0]?.slice(0, 3)).toEqual([line.name, '231-102-5', line.cas ?? '—']);
  });

  it('prints no fixed sentence unrelated to the product and no "generated automatically" note (rule 12)', () => {
    const c = content();
    for (const lang of ['tr', 'en'] as const) {
      const t = allText(c, lang).toLowerCase();
      expect(t).not.toMatch(/otomatik|automatically|inorganik|inorganic/);
    }
    // Flammability wording only for a flammable product.
    expect(allText(c, 'tr')).not.toContain('tutuşturma kaynaklarını');
  });

  it('words first aid after the hazards: eye damage gets immediate medical help', () => {
    const eye = defaultSectionText(content(), 'tr', 's4');
    expect(eye).toContain('Hemen tıbbi yardım alın');
    const mild = defaultSectionText(content('Skin Irrit. 2', 'H315'), 'tr', 's4');
    expect(mild).toContain('Gözü bol suyla durulayın');
  });

  it('leaves exposure limits and other hazards to the KDU and blocks publishing until filled', () => {
    const c = content();
    const blockers = publishBlockers(c, (lang, key) => defaultSectionText(c, lang, key));
    expect(blockers.join(' ')).toMatch(/2\.3/);
    expect(blockers.join(' ')).toMatch(/8\.1/);
    expect(blockers.join(' ')).toMatch(/Bölüm 14/);
  });

  it('has no blockers once the KDU completes every input', () => {
    const c = content();
    c.inputs.identifiedUse = { tr: 'Tekstil yardımcısı', en: 'Textile auxiliary' };
    c.inputs.transport.notRegulated = true;
    c.inputs.kdu = { name: 'Ad Soyad', certificateNo: '123' };
    const filled = (lang: SdsLanguage, key: SectionTextKey) =>
      defaultSectionText(c, lang, key) || 'Bilgi';
    expect(publishBlockers(c, filled)).toEqual([]);
    expect(SECTION_TEXT_KEYS.length).toBeGreaterThan(0);
  });
});

describe('revisions', () => {
  it('compares content independently of key order and names the changed sections', () => {
    const a = content();
    const b = structuredClone(a);
    expect(sameContent(a, b)).toBe(true);
    b.inputs.transport.notRegulated = true;
    expect(sameContent(a, b)).toBe(false);
    expect(changedSections(a, b)).toEqual([14]);
    expect(changedSections(a, content('Skin Irrit. 2', 'H315'))).toContain(2);
  });
});

describe('Section 3 composition', () => {
  it('shows the SEA Annex 6 classification where the supplier SDS is lighter', () => {
    const mixture = buildMixture(
      [{ id: 'l1', raw_material_id: 'a', percent_min: 20, percent_max: 20 }],
      [{ id: 'a', trade_name: 'Etken', approvedExtraction: extraction('Eye Irrit. 2', 'H319') }],
      [],
      {
        '68439-49-6': {
          reference: 'SEA Ek-6 000-000-00-0',
          classifications: [{ category: 'Eye Dam. 1', hCode: 'H318' }],
          verified: true,
          caveat: null,
          profileId: 'p',
        },
      },
    );
    const c = composeContent({
      product: { name: 'Deneme', code: null },
      company: { name: 'Firma', address: '', phone: '', email: '', emergencyPhone: '' },
      inputs: emptyInputs(),
      measurements: [],
      mixture,
      result: classifyMixture(mixture.input),
      dataSources: [],
    });
    expect(c.composition[0]?.classifications).toEqual([{ category: 'Eye Dam. 1', hCode: 'H318' }]);
  });
});

describe('GHS label', () => {
  it('takes every hazard element from the engine and names the substance by its chemical name', () => {
    const c = content('Eye Dam. 1', 'H318', 'Ticari Ad');
    const tr = labelData(c, 'tr');
    expect(tr.signalWord).toBe('TEHLİKE');
    expect(tr.pictograms).toEqual(['GHS05']);
    expect(tr.hazard).toEqual(['H318: Ciddi göz hasarına yol açar.']);
    expect(tr.contains).toEqual(['Alkil eter']);
    expect(JSON.stringify(tr)).not.toContain('Ticari Ad');
    expect(tr.supplier).toEqual(['Firma', 'Adres', '1']);
    expect(tr.emergency).toBe('2');
    expect(labelData(c, 'en').signalWord).toBe('DANGER');
  });

  it('names no substance when the mixture is only an irritant', () => {
    const c = content('Eye Irrit. 2', 'H319');
    const tr = labelData(c, 'tr');
    expect(tr.signalWord).toBe('DİKKAT');
    expect(tr.contains).toEqual([]);
  });

  it('does not call a product with missing data "not classified"', () => {
    const c = content('Eye Dam. 1', 'H318');
    const missing = {
      ...c,
      result: { ...c.result, classifications: [], canFinalize: false },
      notes: [],
    };
    expect(labelData(missing, 'tr').complete).toBe(false);
    expect(labelData(c, 'tr').complete).toBe(c.result.canFinalize);
  });
});
