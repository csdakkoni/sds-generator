import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYWORDS,
  dailyIndexUrl,
  fold,
  scanDailyIndex,
} from '../../../supabase/functions/_shared/gazette/scan';

// Fixtures are written for these tests; the live page layout still has to be checked.
const PAGE = 'https://www.resmigazete.gov.tr/eskiler/2026/10/20261018.htm';

describe('dailyIndexUrl', () => {
  it('fills the date placeholders', () => {
    expect(
      dailyIndexUrl(
        'https://www.resmigazete.gov.tr/eskiler/{YYYY}/{MM}/{YYYY}{MM}{DD}.htm',
        '2026-10-18',
      ),
    ).toBe(PAGE);
  });
  it('rejects malformed dates', () => {
    expect(() => dailyIndexUrl('x{YYYY}', '18-10-2026')).toThrow();
  });
});

describe('fold', () => {
  it('compares Turkish capitals and lower case alike', () => {
    expect(fold('KKDİK')).toBe(fold('kkdik'));
    expect(fold('Güvenlik Bilgi Formu')).toBe(fold('GÜVENLİK BİLGİ FORMU'));
  });
});

describe('scanDailyIndex', () => {
  it('reports a link whose title carries a keyword, with an absolute address', () => {
    const html = `<ul>
      <li><a href="/eskiler/2026/10/20261018-3.htm">Kimyasal Maddelerin Kaydı, Değerlendirilmesi, İzni ve Kısıtlanması (KKDİK) Hakkında Yönetmelikte Değişiklik</a></li>
      <li><a href="/eskiler/2026/10/20261018-4.htm">Bir Başka Karar</a></li></ul>`;
    const found = scanDailyIndex(html, PAGE, DEFAULT_KEYWORDS);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('https://www.resmigazete.gov.tr/eskiler/2026/10/20261018-3.htm');
    expect(found[0]?.matchedKeywords).toEqual(['KKDİK']);
  });

  it('matches SEA only as a whole word', () => {
    const none = scanDailyIndex(
      '<a href="/a.htm">Research and development</a>',
      PAGE,
      DEFAULT_KEYWORDS,
    );
    expect(none).toEqual([]);
    const hit = scanDailyIndex(
      '<a href="/a.htm">SEA Yönetmeliğinde Değişiklik</a>',
      PAGE,
      DEFAULT_KEYWORDS,
    );
    expect(hit[0]?.matchedKeywords).toEqual(['SEA']);
  });

  it('collects several keywords for one title', () => {
    const html =
      '<a href="/b.htm">Maddelerin ve Karışımların Sınıflandırılması ve Güvenlik Bilgi Formu</a>';
    expect(scanDailyIndex(html, PAGE, DEFAULT_KEYWORDS)[0]?.matchedKeywords).toEqual([
      'Maddelerin ve Karışımların Sınıflandırılması',
      'Güvenlik Bilgi Formu',
    ]);
  });

  it('falls back to the page text when no link title matches', () => {
    const html =
      '<div>Bugünkü sayıda güvenlik bilgi formu hakkında bir düzenleme yer alıyor.</div>';
    const found = scanDailyIndex(html, PAGE, DEFAULT_KEYWORDS);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe(PAGE);
    expect(found[0]?.excerpt).toContain('güvenlik bilgi formu');
  });

  it('reports nothing for an unrelated page and ignores scripts', () => {
    const html = '<script>var x = "KKDİK";</script><a href="/c.htm">Atama Kararları</a>';
    expect(scanDailyIndex(html, PAGE, DEFAULT_KEYWORDS)).toEqual([]);
  });

  it('decodes entities and de-duplicates the same address', () => {
    const html = `<a href="/d.htm">KKDİK&nbsp;Tebliği</a><a href="/d.htm">KKDİK Tebliği</a>`;
    const found = scanDailyIndex(html, PAGE, DEFAULT_KEYWORDS);
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe('KKDİK Tebliği');
  });
});
