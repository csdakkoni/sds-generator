import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';

interface Row {
  id: string;
  product_id: string;
  document_number: string;
  status: 'draft' | 'in_review' | 'published' | 'withdrawn';
  products: { name: string; code: string | null } | null;
  sds_revisions: { revision_number: number; approved_at: string | null }[];
}

const trDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

/** One row per product: the TR and EN documents share the number and revisions. */
export function SdsList({
  membership,
  onOpen,
}: {
  membership: Membership;
  onOpen: (productId: string) => void;
}) {
  const [items, setItems] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase
      .from('sds_documents')
      .select(
        'id, product_id, document_number, status, products (name, code), sds_revisions (revision_number, approved_at)',
      )
      .eq('organization_id', membership.organization_id)
      .eq('language', 'tr')
      .order('document_number')
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setItems(data as unknown as Row[]);
      });
    return () => {
      active = false;
    };
  }, [membership.organization_id]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SDS'ler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ürün sayfasında oluşturulan güvenlik bilgi formları. Açmak için ürüne tıkla.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="text-sm text-slate-500">
          Henüz SDS yok. Ürünler bölümünde bir ürünü aç, sınıflandırmanın altındaki "SDS taslağı
          oluştur" düğmesini kullan.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((d) => {
            const revisions = [...d.sds_revisions].sort(
              (a, b) => b.revision_number - a.revision_number,
            );
            const latest = revisions[0];
            const approved = revisions.find((r) => r.approved_at);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onOpen(d.product_id)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-sky-300"
                >
                  <span className="font-mono text-sm text-slate-600">{d.document_number}</span>
                  <span className="font-semibold">{d.products?.name}</span>
                  <span className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
                    {d.status === 'published' && approved?.approved_at && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                        Yayında · revizyon {approved.revision_number} ·{' '}
                        {trDate(approved.approved_at)}
                      </span>
                    )}
                    {latest && !latest.approved_at && (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
                        Revizyon {latest.revision_number} taslak
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
