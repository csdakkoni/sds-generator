import type { Extraction } from './schema.ts';

type Flag = Extraction['flags'][number];

interface Located {
  path: string;
  page: number;
  quote: string;
}

function normalise(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/** Every `source` in the extraction with its JSON path. */
function sources(value: unknown, path: string, out: Located[]): Located[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => sources(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      const child = path ? `${path}.${key}` : key;
      const s = v as { page?: unknown; quote?: unknown } | null;
      if ((key === 'source' || key === 'statusSource') && s && typeof s.quote === 'string') {
        out.push({ path, page: Number(s.page), quote: s.quote });
      } else {
        sources(v, child, out);
      }
    }
  }
  return out;
}

/**
 * Checks the model output against the PDF text and basic consistency rules. Findings are
 * added as flags prefixed with "[kontrol]" so the reviewer can tell them from model flags.
 */
export function checkExtraction(extraction: Extraction, pages: string[] | null): Flag[] {
  const flags: Flag[] = [];
  const add = (field: string, kind: Flag['kind'], message: string, page: number | null = null) =>
    flags.push({ field, kind, message: `[kontrol] ${message}`, page });

  if (pages) {
    const normalisedPages = pages.map(normalise);
    for (const s of sources(extraction, '', [])) {
      const quote = normalise(s.quote);
      if (!quote) continue;
      if (normalisedPages[s.page - 1]?.includes(quote)) continue;
      const found = normalisedPages.findIndex((p) => p.includes(quote));
      if (found === -1) {
        add(
          s.path,
          'unreadable',
          `Alıntı belgede birebir bulunamadı: "${s.quote}". Değer elle doğrulanmalı.`,
          s.page,
        );
      } else {
        add(
          s.path,
          'other',
          `Alıntı ${s.page}. sayfada değil, ${found + 1}. sayfada bulundu.`,
          found + 1,
        );
      }
    }
  }

  extraction.components.forEach((c, i) => {
    const field = `components[${i}]`;
    const name = c.name.value ?? `${i + 1}. bileşen`;
    if (!c.concentration) {
      add(`${field}.concentration`, 'missing_expected', `${name} için konsantrasyon yok.`);
    } else {
      const { min, max } = c.concentration;
      if (min !== null && max !== null && min > max) {
        add(
          `${field}.concentration`,
          'conflict',
          `${name}: alt sınır (%${min}) üst sınırdan (%${max}) büyük.`,
        );
      }
      if (min === null || max === null) {
        add(
          `${field}.concentration`,
          'ambiguous',
          `${name}: konsantrasyonun bir sınırı açık ("${c.concentration.raw}"). Motor için iki sınır da gerekli.`,
        );
      }
    }
    if (c.cas.status === 'not_stated') {
      add(`${field}.cas`, 'missing_expected', `${name} için CAS numarası yok.`);
    }
  });

  const pc = extraction.productClassification;
  if (pc.status === 'classified' && pc.lines.length === 0) {
    add(
      'productClassification',
      'conflict',
      'Hammadde "sınıflandırılmış" ama sınıflandırma satırı okunmadı.',
    );
  }
  return flags;
}
