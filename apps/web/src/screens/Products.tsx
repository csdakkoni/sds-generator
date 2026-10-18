import { useEffect, useState } from 'react';
import { canEdit } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';

interface ProductRow {
  id: string;
  name: string;
  code: string | null;
  recipe_lines: { id: string }[];
}

export function Products({
  membership,
  onOpen,
}: {
  membership: Membership;
  onOpen: (productId: string) => void;
}) {
  const [items, setItems] = useState<ProductRow[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(membership);

  useEffect(() => {
    let active = true;
    void supabase
      .from('products')
      .select('id, name, code, recipe_lines (id)')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setItems(data as ProductRow[]);
      });
    return () => {
      active = false;
    };
  }, [membership.organization_id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const { data, error: createError } = await supabase
      .from('products')
      .insert({
        organization_id: membership.organization_id,
        name: name.trim(),
        code: code.trim() || null,
      })
      .select('id')
      .single();
    if (createError || !data) {
      setError(
        createError?.code === '23505'
          ? 'Bu ürün kodu zaten kullanılıyor.'
          : `Ürün oluşturulamadı: ${createError?.message}`,
      );
      return;
    }
    onOpen(data.id);
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ürünler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ürününü oluştur, reçetesini ve ölçtüğün değerleri gir; sistem sınıflandırmayı hesaplar.
        </p>
      </div>
      {editable && (
        <form
          onSubmit={(e) => void create(e)}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <label className="grid flex-1 gap-1 text-sm">
            <span className="text-slate-600">Ürün adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="min-w-48 rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Ürün kodu (isteğe bağlı)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-40 rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-sky-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Ürün ekle
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Ürünlerin {items ? `(${items.length})` : ''}
        </h2>
        {items === null && <p className="px-4 py-6 text-sm text-slate-500">Yükleniyor…</p>}
        {items?.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Henüz ürün yok.</p>}
        {items?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
          >
            <span className="min-w-0">
              <b className="block truncate">{p.name}</b>
              <small className="text-slate-500">
                {[p.code, `${p.recipe_lines.length} reçete satırı`].filter(Boolean).join(' · ')}
              </small>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
