/**
 * Daily watch of the Resmî Gazete index for regulation changes.
 *
 * Reads each enabled regulatory source, opens the daily index page, looks for the configured
 * keywords and records what it finds as regulatory_change_events (plus one platform-level
 * KDU queue item per event). It never changes any classification, product or SDS: detection is
 * automatic, interpretation and application stay with people.
 *
 * Called by the daily schedule (supabase/schedules/watch-gazette.sql) and by a platform admin
 * for a manual run. The page addresses come from the database template, never from the request.
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_KEYWORDS, dailyIndexUrl, scanDailyIndex } from '../_shared/gazette/scan.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A scheduled (non-admin) call skips a source that was checked this recently.
const MIN_INTERVAL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface Source {
  id: string;
  name: string;
  url_template: string;
  keywords: string[];
  last_checked_at: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function istanbulDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(shifted);
}

/** Decodes the page with the charset it declares; falls back to windows-1254 if UTF-8 looks broken. */
function decodePage(bytes: ArrayBuffer, contentType: string | null): string {
  const declared = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (declared && declared !== 'utf-8') {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8.includes('�') ? new TextDecoder('windows-1254').decode(bytes) : utf8;
}

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'sds-regulatory-watch/1.0' },
  });
  if (!response.ok) return { status: response.status, html: '' };
  return {
    status: response.status,
    html: decodePage(await response.arrayBuffer(), response.headers.get('content-type')),
  };
}

async function notify(admin: ReturnType<typeof createClient>, lines: string[]): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  if (!key || !from) return 'e-posta gönderilmedi: RESEND_API_KEY ve NOTIFY_FROM tanımlı değil';
  const { data: admins } = await admin.from('platform_admins').select('user_id');
  const emails: string[] = [];
  for (const row of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(row.user_id as string);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return 'e-posta gönderilmedi: platform yöneticisinin e-postası yok';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: emails,
      subject: 'Resmî Gazete: olası mevzuat değişikliği',
      text: `${lines.join('\n')}\n\nBu bir otomatik tespittir; hiçbir sınıflandırma değiştirilmedi. İnceleme Yönetim ekranındadır.`,
    }),
  });
  return response.ok
    ? `e-posta gönderildi (${emails.length})`
    : `e-posta hatası: HTTP ${response.status}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const url = env('SUPABASE_URL');
    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));

    // A platform admin may pick the dates; anyone else (the schedule) gets today and yesterday.
    const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: isAdmin } = await caller.rpc('is_platform_admin');
    const body = (await req.json().catch(() => ({}))) as { date?: unknown; days?: unknown };
    let dates = [istanbulDate(0), istanbulDate(-1)];
    if (isAdmin === true) {
      const days =
        typeof body.days === 'number' ? Math.min(Math.max(Math.trunc(body.days), 1), 31) : 1;
      const end =
        typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
          ? body.date
          : istanbulDate(0);
      dates = Array.from({ length: days }, (_, i) => {
        const d = new Date(`${end}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        return d.toISOString().slice(0, 10);
      });
    }

    const { data: sources, error } = await admin
      .from('regulatory_sources')
      .select('id, name, url_template, keywords, last_checked_at')
      .eq('enabled', true)
      .eq('kind', 'gazette_daily_index');
    if (error) throw new Error(error.message);

    const report: unknown[] = [];
    const newLines: string[] = [];
    for (const source of (sources ?? []) as Source[]) {
      if (
        isAdmin !== true &&
        source.last_checked_at &&
        Date.now() - new Date(source.last_checked_at).getTime() < MIN_INTERVAL_MS
      ) {
        report.push({ source: source.name, skipped: 'yakın zamanda kontrol edildi' });
        continue;
      }
      const keywords = source.keywords.length > 0 ? source.keywords : [...DEFAULT_KEYWORDS];
      const statuses: string[] = [];
      for (const date of dates) {
        const pageUrl = dailyIndexUrl(source.url_template, date);
        try {
          const page = await fetchPage(pageUrl);
          if (page.status === 404) {
            statuses.push(`${date}: sayı yok (404)`);
            continue;
          }
          if (page.status !== 200) {
            statuses.push(`${date}: HTTP ${page.status}`);
            continue;
          }
          const findings = scanDailyIndex(page.html, pageUrl, keywords);
          let created = 0;
          for (const finding of findings) {
            const { data: inserted, error: insertError } = await admin
              .from('regulatory_change_events')
              .upsert(
                {
                  source_id: source.id,
                  gazette_date: date,
                  title: finding.title,
                  url: finding.url,
                  matched_keywords: finding.matchedKeywords,
                  excerpt: finding.excerpt,
                },
                { onConflict: 'source_id,url', ignoreDuplicates: true },
              )
              .select('id');
            if (insertError) throw new Error(insertError.message);
            const eventId = inserted?.[0]?.id as string | undefined;
            if (!eventId) continue;
            created += 1;
            newLines.push(
              `${date}: ${finding.title} (${finding.matchedKeywords.join(', ')})\n${finding.url}`,
            );
            await admin.from('kdu_review_queue').insert({
              organization_id: null,
              item_type: 'regulation_change',
              title: finding.title,
              detail: { url: finding.url, keywords: finding.matchedKeywords, gazette_date: date },
              change_event_id: eventId,
            });
          }
          statuses.push(`${date}: ${findings.length} bulgu, ${created} yeni`);
        } catch (e) {
          statuses.push(`${date}: hata (${e instanceof Error ? e.message : String(e)})`);
        }
      }
      await admin
        .from('regulatory_sources')
        .update({
          last_checked_at: new Date().toISOString(),
          last_status: statuses.join(' | ').slice(0, 500),
        })
        .eq('id', source.id);
      report.push({ source: source.name, statuses });
    }

    const mail = newLines.length > 0 ? await notify(admin, newLines) : 'yeni bulgu yok';
    return json({ report, mail });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
