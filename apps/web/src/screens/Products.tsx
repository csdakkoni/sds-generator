import { useEffect, useState } from 'react';
import { canEdit } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';
import { Alert, Card, EmptyState, PageHeader, buttonClass } from '../ui';

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
      <PageHeader
        title="Ürünler"
        description="Ürününü oluştur, reçetesini ve ölçtüğün değerleri gir; sistem sınıflandırmayı hesaplar."
      />
      {editable && (
        <form
          onSubmit={(e) => void create(e)}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <label className="grid flex-1 gap-1 text-sm">
            <span className="text-slate-600">Ürün adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="min-w-48 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Ürün kodu (isteğe bağlı)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-40 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className={buttonClass()}>
            Ürün ekle
          </button>
        </form>
      )}
      {error && <Alert>{error}</Alert>}
      <Card title={`Ürünlerin${items ? ` (${items.length})` : ''}`} padded={false}>
        {items === null && <p className="px-4 py-6 text-sm text-slate-500">Yükleniyor…</p>}
        {items?.length === 0 && (
          <EmptyState title="Henüz ürün yok">Yukarıdan ilk ürününü ekle.</EmptyState>
        )}
        {items?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50"
          >
            <span className="min-w-0">
              <b className="block truncate">{p.name}</b>
              <small className="text-slate-500">
                {[p.code, `${p.recipe_lines.length} reçete satırı`].filter(Boolean).join(' · ')}
              </small>
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}
