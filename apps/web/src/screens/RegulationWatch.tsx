import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type EventStatus = 'new' | 'reviewing' | 'dismissed' | 'applied';

interface ChangeEvent {
  id: string;
  gazette_date: string;
  title: string;
  url: string;
  matched_keywords: string[];
  excerpt: string | null;
  status: EventStatus;
}

interface Source {
  name: string;
  last_checked_at: string | null;
  last_status: string | null;
}

const LABELS: Record<EventStatus, string> = {
  new: 'Yeni',
  reviewing: 'İnceleniyor',
  dismissed: 'İlgisiz',
  applied: 'Uygulandı',
};

/** Platform admin: Resmî Gazete findings. Detection is automatic; every decision here is a person's. */
export function RegulationWatch() {
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [eventResult, sourceResult] = await Promise.all([
      supabase
        .from('regulatory_change_events')
        .select('id, gazette_date, title, url, matched_keywords, excerpt, status')
        .order('gazette_date', { ascending: false })
        .limit(50),
      supabase.from('regulatory_sources').select('name, last_checked_at, last_status'),
    ]);
    if (eventResult.error) setError(eventResult.error.message);
    else setEvents((eventResult.data ?? []) as ChangeEvent[]);
    if (!sourceResult.error) setSources((sourceResult.data ?? []) as Source[]);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function setStatus(id: string, status: EventStatus) {
    setError(null);
    const { data: user } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from('regulatory_change_events')
      .update({ status, reviewed_by: user.user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) setError(updateError.message);
    await load();
  }

  async function checkNow() {
    setBusy(true);
    setError(null);
    const { error: callError } = await supabase.functions.invoke('watch-gazette', {
      body: { days: 3 },
    });
    if (callError) setError(callError.message);
    await load();
    setBusy(false);
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Mevzuat izleme</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void checkNow()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold hover:border-sky-300 disabled:opacity-50"
        >
          {busy ? 'Kontrol ediliyor…' : 'Son 3 günü şimdi kontrol et'}
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Resmî Gazete günlük indeksi her sabah taranır. Bulgular yalnızca bildirimdir; hiçbir
        sınıflandırma kendiliğinden değişmez. Yorum ve uygulama kararı sizindir.
      </p>
      {sources.map((source) => (
        <p key={source.name} className="text-xs text-slate-500">
          {source.name}: son kontrol{' '}
          {source.last_checked_at ? new Date(source.last_checked_at).toLocaleString('tr-TR') : '—'}
          {source.last_status ? ` (${source.last_status})` : ''}
        </p>
      ))}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Henüz bulgu yok.</p>
      ) : (
        <ul className="grid gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{event.gazette_date}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{LABELS[event.status]}</span>
                <span>{event.matched_keywords.join(', ')}</span>
              </div>
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-sm font-medium text-sky-800 underline"
              >
                {event.title}
              </a>
              {event.excerpt && <p className="mt-1 text-xs text-slate-500">{event.excerpt}</p>}
              <div className="mt-2 flex gap-2">
                {(['reviewing', 'dismissed', 'applied'] as const)
                  .filter((s) => s !== event.status)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void setStatus(event.id, s)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-sky-300"
                    >
                      {LABELS[s]}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
