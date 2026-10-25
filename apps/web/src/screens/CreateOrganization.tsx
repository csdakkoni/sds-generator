import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function CreateOrganization({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: (organizationId: string) => void;
}) {
  const [name, setName] = useState('');
  const [isKdu, setIsKdu] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: orgId, error: createError } = await supabase.rpc('create_organization', {
      org_name: name.trim(),
    });
    if (createError || !orgId) {
      setError(`Firma oluşturulamadı: ${createError?.message ?? 'bilinmeyen hata'}`);
      setBusy(false);
      return;
    }
    if (isKdu) {
      const { error: roleError } = await supabase
        .from('organization_members')
        .update({ extra_roles: ['kdu'] })
        .eq('organization_id', orgId)
        .eq('user_id', userId);
      if (roleError) setError(`Firma oluştu ama KDU rolü eklenemedi: ${roleError.message}`);
    }
    setBusy(false);
    onCreated(orgId as string);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <form
        onSubmit={submit}
        className="grid w-full max-w-md gap-4 rounded-xl border border-slate-200 bg-white shadow-sm p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Firmanı oluştur</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hammaddeler, reçeteler ve SDS'ler firmana ait olur; başka firmalar göremez.
          </p>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Firma adı</span>
          <input
            id="org-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            id="is-kdu"
            type="checkbox"
            checked={isKdu}
            onChange={(e) => setIsKdu(e.target.checked)}
            className="mt-1"
          />
          <span>
            Bu firmanın Kimyasal Değerlendirme Uzmanı (KDU) benim.
            <span className="block text-slate-500">KDU, hammadde ve SDS onaylarını verebilir.</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-sky-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Firmayı oluştur
        </button>
      </form>
    </main>
  );
}
