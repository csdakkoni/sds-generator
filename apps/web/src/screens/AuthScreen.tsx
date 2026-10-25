import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error)
        setMessage({
          tone: 'error',
          text: 'E-posta veya şifre hatalı. E-postanı onayladıysan tekrar dene.',
        });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) setMessage({ tone: 'error', text: `Kayıt olmadı: ${error.message}` });
      else if (!data.session)
        setMessage({
          tone: 'info',
          text: 'Onay e-postası gönderildi. E-postadaki bağlantıya tıkla, sonra buradan giriş yap.',
        });
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-sm p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          SDS Hazırlama Sistemi
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'signin' ? 'Hesabınla giriş yap.' : 'Yeni hesap oluştur.'}
        </p>
        <form className="mt-5 grid gap-3" onSubmit={submit}>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">E-posta</span>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Şifre</span>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {message && (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-md px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-800'}`}
            >
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-sky-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {mode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-sky-800 underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage(null);
          }}
        >
          {mode === 'signin' ? 'Hesabın yok mu? Kayıt ol' : 'Hesabın var mı? Giriş yap'}
        </button>
      </div>
    </main>
  );
}
