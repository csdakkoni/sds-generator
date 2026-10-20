import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { hasRole } from './lib/review';
import { supabase } from './lib/supabase';
import type { Membership } from './lib/types';
import { Admin } from './screens/Admin';
import { AuthScreen } from './screens/AuthScreen';
import { CreateOrganization } from './screens/CreateOrganization';
import { KduList } from './screens/KduList';
import { Product } from './screens/Product';
import { Products } from './screens/Products';
import { RawMaterials } from './screens/RawMaterials';
import { Review } from './screens/Review';
import { SdsList } from './screens/SdsList';

/** Routes live in the hash so the static host needs no server rewrites. */
function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/hammaddeler');
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || '/hammaddeler');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [route, (next) => (window.location.hash = next)];
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [route, navigate] = useHashRoute();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const [membershipVersion, setMembershipVersion] = useState(0);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase.rpc('is_platform_admin').then(({ data }) => {
      if (active) setPlatformAdmin(data === true);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase
      .from('organization_members')
      .select('organization_id, role, extra_roles, organizations (name)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setMembership((data as Membership | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [userId, membershipVersion]);

  if (session === undefined) return null;
  if (!session) return <AuthScreen />;
  if (membership === undefined) return null;
  if (!membership)
    return (
      <CreateOrganization
        userId={session.user.id}
        onCreated={() => setMembershipVersion((v) => v + 1)}
      />
    );

  const reviewId = route.match(/^\/hammaddeler\/([0-9a-f-]{36})$/)?.[1];
  const productId = route.match(/^\/urunler\/([0-9a-f-]{36})$/)?.[1];
  const section = route.startsWith('/urunler')
    ? 'urunler'
    : route.startsWith('/sds')
      ? 'sds'
      : route.startsWith('/yonetim')
        ? 'yonetim'
        : route.startsWith('/kdu')
          ? 'kdu'
          : 'hammaddeler';
  const showKdu = platformAdmin || hasRole(membership, 'kdu');
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 ${active ? 'bg-sky-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;
  const roleLabel = hasRole(membership, 'kdu')
    ? 'KDU'
    : membership.role === 'viewer'
      ? 'Görüntüleyici'
      : 'Düzenleyici';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <i
              aria-hidden="true"
              className="inline-block h-4 w-4 rotate-45 border-[3px] border-red-700"
            />
            SDS Hazırlama
          </span>
          <nav aria-label="Bölümler" className="flex flex-wrap gap-1 text-sm">
            <a href="#/hammaddeler" className={tab(section === 'hammaddeler')}>
              Hammaddeler
            </a>
            <a href="#/urunler" className={tab(section === 'urunler')}>
              Ürünler
            </a>
            <a href="#/sds" className={tab(section === 'sds')}>
              SDS'ler
            </a>
            {showKdu && (
              <a href="#/kdu" className={tab(section === 'kdu')}>
                KDU listesi
              </a>
            )}
            {platformAdmin && (
              <a href="#/yonetim" className={tab(section === 'yonetim')}>
                Yönetim
              </a>
            )}
          </nav>
          <span className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span className="hidden sm:inline">
              {membership.organizations?.name} · {roleLabel}
            </span>
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              className="text-sky-800 underline"
            >
              Çıkış
            </button>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {productId ? (
          <Product
            membership={membership}
            userId={session.user.id}
            productId={productId}
            onBack={() => navigate('/urunler')}
          />
        ) : section === 'kdu' && showKdu ? (
          <KduList userId={session.user.id} />
        ) : section === 'yonetim' && platformAdmin ? (
          <Admin />
        ) : section === 'sds' ? (
          <SdsList membership={membership} onOpen={(id) => navigate(`/urunler/${id}`)} />
        ) : section === 'urunler' ? (
          <Products membership={membership} onOpen={(id) => navigate(`/urunler/${id}`)} />
        ) : reviewId ? (
          <Review
            membership={membership}
            userId={session.user.id}
            rawMaterialId={reviewId}
            onBack={() => navigate('/hammaddeler')}
          />
        ) : (
          <RawMaterials membership={membership} onOpen={(id) => navigate(`/hammaddeler/${id}`)} />
        )}
      </main>
    </div>
  );
}
