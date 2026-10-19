/**
 * Scans a Resmî Gazete daily index page for regulation changes we care about.
 * Plain TypeScript (no Deno or DOM APIs) so it runs in the Edge Function and in tests.
 * It only reports what the page says; it never interprets or applies a change.
 */

export const DEFAULT_KEYWORDS = [
  'Maddelerin ve Karışımların Sınıflandırılması',
  'KKDİK',
  'Güvenlik Bilgi Formu',
  'SEA',
] as const;

export interface Finding {
  title: string;
  url: string;
  matchedKeywords: string[];
  excerpt: string | null;
}

/** Lowercases with Turkish rules and drops diacritics so "KKDİK" and "kkdik" compare equal. */
export function fold(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function matchedKeywords(text: string, keywords: readonly string[]): string[] {
  const haystack = fold(text);
  return keywords.filter((keyword) => {
    const needle = fold(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Whole words only, so "SEA" does not match inside another word.
    return new RegExp(`(?<![\\p{L}\\p{N}])${needle}(?![\\p{L}\\p{N}])`, 'u').test(haystack);
  });
}

/** Builds the daily index address from a template with {YYYY}, {MM} and {DD} placeholders. */
export function dailyIndexUrl(template: string, date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`invalid date: ${date}`);
  const [, yyyy = '', mm = '', dd = ''] = match;
  return template.replaceAll('{YYYY}', yyyy).replaceAll('{MM}', mm).replaceAll('{DD}', dd);
}

export function scanDailyIndex(
  html: string,
  pageUrl: string,
  keywords: readonly string[],
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchor)) {
    const title = stripTags(m[2] ?? '');
    if (!title) continue;
    const hits = matchedKeywords(title, keywords);
    if (hits.length === 0) continue;
    let url: string;
    try {
      url = new URL(decodeEntities(m[1] ?? ''), pageUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    findings.push({ title, url, matchedKeywords: hits, excerpt: null });
  }
  if (findings.length > 0) return findings;

  // No link title matched: fall back to the page text so a layout change cannot hide a hit.
  const text = stripTags(html);
  const hits = matchedKeywords(text, keywords);
  if (hits.length === 0) return [];
  const first = hits[0] ?? '';
  const at = fold(text).indexOf(fold(first));
  const start = Math.max(0, at - 120);
  return [
    {
      title: 'Günlük indekste anahtar kelime geçiyor',
      url: pageUrl,
      matchedKeywords: hits,
      excerpt: text.slice(start, start + 320),
    },
  ];
}
