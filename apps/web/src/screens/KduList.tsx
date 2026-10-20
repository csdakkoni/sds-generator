import { useCallback, useEffect, useState } from 'react';
import { ITEM_LABEL, openCounts, sortItems, type ReviewItem } from '../lib/kdu-list';
import { supabase } from '../lib/supabase';

/** One list for everything waiting on a KDU decision. RLS shows each person only their items. */
export function KduList({ userId }: { userId: string }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('kdu_review_queue')
      .select('id, item_type, status, title, detail, organization_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (loadError) setError(loadError.message);
    else setItems((data ?? []) as ReviewItem[]);
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

  async function close(id: string, status: 'resolved' | 'dismissed') {
    setError(null);
    const { error: updateError } = await supabase
      .from('kdu_review_queue')
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) setError(updateError.message);
    await load();
  }

  const open = items.filter((i) => i.status === 'open');
  const counts = openCounts(items);
  const visible = sortItems(showDone ? items : open);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">KDU kontrol listesi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Karar bekleyen her şey burada toplanır. Bekleyen bir kontrol işi durdurmaz: taslaklar
          üretilmeye devam eder, yalnızca "kesinleşti" durumu KDU onayına bağlıdır.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        {open.length === 0
          ? 'Bekleyen kontrol yok.'
          : `${open.length} bekleyen: ` +
            Object.entries(counts)
              .map(([type, n]) => `${ITEM_LABEL[type as keyof typeof ITEM_LABEL]} ${n}`)
              .join(', ')}
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Kapananları da göster
      </label>
      <ul className="grid gap-2">
        {visible.map((item) => {
          const url = typeof item.detail.url === 'string' ? item.detail.url : null;
          return (
            <li key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {ITEM_LABEL[item.item_type]}
                </span>
                <span>{new Date(item.created_at).toLocaleDateString('tr-TR')}</span>
                {item.status !== 'open' && (
                  <span>{item.status === 'resolved' ? 'Çözüldü' : 'Yoksayıldı'}</span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="text-sky-800 underline">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </p>
              {item.status === 'open' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void close(item.id, 'resolved')}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-sky-300"
                  >
                    Çözüldü
                  </button>
                  <button
                    type="button"
                    onClick={() => void close(item.id, 'dismissed')}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-sky-300"
                  >
                    İlgisiz
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
