import { useCallback, useEffect, useState } from 'react';
import { ITEM_LABEL, openCounts, sortItems, type ReviewItem } from '../lib/kdu-list';
import { supabase } from '../lib/supabase';
import { Alert, Badge, buttonClass, EmptyState, PageHeader, type Tone } from '../ui';

const TYPE_TONE: Record<string, Tone> = {
  profile_conflict: 'bad',
  data_gap: 'warn',
  regulation_change: 'violet',
  supplier_sds_match: 'info',
  profile_draft: 'info',
  draft_revision: 'neutral',
};

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
    <div className="grid gap-5">
      <PageHeader
        title="KDU kontrol listesi"
        description='Karar bekleyen her şey burada toplanır. Bekleyen bir kontrol işi durdurmaz: taslaklar üretilmeye devam eder, yalnızca "kesinleşti" durumu KDU onayına bağlıdır.'
      />
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        {open.length === 0 ? (
          <Badge tone="good">Bekleyen kontrol yok</Badge>
        ) : (
          <>
            <span className="text-sm font-medium text-slate-700">{open.length} bekleyen:</span>
            {Object.entries(counts).map(([type, n]) => (
              <Badge key={type} tone={TYPE_TONE[type] ?? 'neutral'}>
                {ITEM_LABEL[type as keyof typeof ITEM_LABEL] ?? type} {n}
              </Badge>
            ))}
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Kapananları da göster
        </label>
      </div>
      <ul className="grid divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {visible.length === 0 && (
          <li>
            <EmptyState title="Liste boş">
              Karar bekleyen bir şey çıktığında burada görünür.
            </EmptyState>
          </li>
        )}
        {visible.map((item) => {
          const url = typeof item.detail.url === 'string' ? item.detail.url : null;
          return (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-4 ${item.status === 'open' ? '' : 'opacity-60'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone={TYPE_TONE[item.item_type] ?? 'neutral'}>
                    {ITEM_LABEL[item.item_type] ?? item.item_type}
                  </Badge>
                  <span>{new Date(item.created_at).toLocaleDateString('tr-TR')}</span>
                  {item.status !== 'open' && (
                    <span>{item.status === 'resolved' ? 'Çözüldü' : 'Yoksayıldı'}</span>
                  )}
                </div>
                <p className="mt-1 font-medium text-slate-900">{item.title}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {url && (
                  <a
                    href={url}
                    {...(url.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' })}
                    className={buttonClass('primary')}
                  >
                    Aç
                  </a>
                )}
                {item.status === 'open' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void close(item.id, 'resolved')}
                      className={buttonClass('secondary')}
                    >
                      Çözüldü
                    </button>
                    <button
                      type="button"
                      onClick={() => void close(item.id, 'dismissed')}
                      className={buttonClass('ghost')}
                    >
                      İlgisiz
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
