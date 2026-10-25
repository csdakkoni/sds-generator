import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { hasRole } from './lib/review';
import { supabase } from './lib/supabase';
import type { Membership } from './lib/types';
import { Admin } from './screens/Admin';
import { AuthScreen } from './screens/AuthScreen';
import { CreateOrganization } from './screens/CreateOrganization';
import { Home } from './screens/Home';
import { KduList } from './screens/KduList';
import { Product } from './screens/Product';
import { Products } from './screens/Products';
import { RawMaterials } from './screens/RawMaterials';
import { Review } from './screens/Review';
import { SubstanceDetail } from './screens/SubstanceDetail';
import { SubstanceLibrary } from './screens/SubstanceLibrary';
import { SdsList } from './screens/SdsList';
import { Icon, type IconName } from './ui';

const ORG_KEY = 'sds.organization';

function storedOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

function storeOrg(id: string) {
  try {
    localStorage.setItem(ORG_KEY, id);
  } catch {
    // Private windows may refuse storage; the first firm is used then.
  }
}

/** Routes live in the hash so the static host needs no server rewrites. */
function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [route, (next) => (window.location.hash = next)];
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberships, setMemberships] = useState<Membership[] | undefined>(undefined);
  const [orgId, setOrgId] = useState<string | null>(storedOrg);
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
    // A KDU can work for several firms; every membership is loaded and one is picked.
    void supabase
      .from('organization_members')
      .select('organization_id, role, extra_roles, organizations (name)')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (active) setMemberships((data as Membership[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [userId, membershipVersion]);

  function chooseOrg(id: string) {
    storeOrg(id);
    setOrgId(id);
    navigate('/');
  }

  if (session === undefined) return null;
  if (!session) return <AuthScreen />;
  if (memberships === undefined) return null;
  const created = (id: string) => {
    storeOrg(id);
    setOrgId(id);
    setMembershipVersion((v) => v + 1);
    navigate('/');
  };
  const membership = memberships.find((m) => m.organization_id === orgId) ?? memberships[0];
  if (!membership || route === '/yeni-firma')
    return <CreateOrganization userId={session.user.id} onCreated={created} />;

  const reviewId = route.match(/^\/hammaddeler\/([0-9a-f-]{36})$/)?.[1];
  const productId = route.match(/^\/urunler\/([0-9a-f-]{36})$/)?.[1];
  const substanceCas = route.match(/^\/kutuphane\/(\d{2,7}-\d{2}-\d)$/)?.[1];
  const section = route.startsWith('/urunler')
    ? 'urunler'
    : route.startsWith('/kutuphane')
      ? 'kutuphane'
      : route.startsWith('/sds')
        ? 'sds'
        : route.startsWith('/yonetim')
          ? 'yonetim'
          : route.startsWith('/kdu')
            ? 'kdu'
            : route.startsWith('/hammaddeler')
              ? 'hammaddeler'
              : 'baslangic';
  const showKdu = platformAdmin || hasRole(membership, 'kdu');
  const roleLabel = hasRole(membership, 'kdu')
    ? 'KDU'
    : membership.role === 'viewer'
      ? 'Görüntüleyici'
      : 'Düzenleyici';
  const nav: { key: string; label: string; icon: IconName; show: boolean }[] = [
    { key: 'baslangic', label: 'Başlangıç', icon: 'home', show: true },
    { key: 'hammaddeler', label: 'Hammaddeler', icon: 'flask', show: true },
    { key: 'urunler', label: 'Ürünler', icon: 'box', show: true },
    { key: 'sds', label: "SDS'ler", icon: 'file', show: true },
    { key: 'kdu', label: 'KDU kontrol listesi', icon: 'check', show: showKdu },
    { key: 'kutuphane', label: 'Madde kütüphanesi', icon: 'book', show: true },
    { key: 'yonetim', label: 'Yönetim', icon: 'cog', show: platformAdmin },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4 font-semibold">
          <i
            aria-hidden="true"
            className="inline-block h-4 w-4 rotate-45 border-[3px] border-red-700"
          />
          SDS Hazırlama
        </div>
        <div className="px-3 pb-3">
          <label className="block">
            <span className="sr-only">Firma</span>
            <select
              aria-label="Firma"
              value={membership.organization_id}
              onChange={(e) =>
                e.target.value === 'new' ? navigate('/yeni-firma') : chooseOrg(e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium"
            >
              {memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organizations?.name}
                </option>
              ))}
              <option value="new">+ Yeni firma ekle</option>
            </select>
          </label>
        </div>
        <nav
          aria-label="Bölümler"
          className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-1 lg:flex-col lg:overflow-visible"
        >
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <a
                key={n.key}
                href={`#/${n.key === 'baslangic' ? '' : n.key}`}
                aria-current={section === n.key ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 font-medium ${
                  section === n.key
                    ? 'bg-sky-50 text-sky-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon name={n.icon} className="h-5 w-5 shrink-0" />
                {n.label}
              </a>
            ))}
        </nav>
        <div className="hidden border-t border-slate-200 px-5 py-4 text-sm lg:block">
          <p className="truncate text-slate-700">{session.user.email}</p>
          <p className="text-slate-500">{roleLabel}</p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="mt-2 text-sky-800 hover:underline"
          >
            Çıkış
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        {productId ? (
          <Product membership={membership} userId={session.user.id} productId={productId} />
        ) : section === 'kdu' && showKdu ? (
          <KduList userId={session.user.id} />
        ) : section === 'yonetim' && platformAdmin ? (
          <Admin />
        ) : section === 'kutuphane' && substanceCas ? (
          <SubstanceDetail
            cas={substanceCas}
            membership={membership}
            userId={session.user.id}
            platformAdmin={platformAdmin}
          />
        ) : section === 'kutuphane' ? (
          <SubstanceLibrary />
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
        ) : section === 'baslangic' ? (
          <Home membership={membership} />
        ) : (
          <RawMaterials membership={membership} onOpen={(id) => navigate(`/hammaddeler/${id}`)} />
        )}
      </main>
    </div>
  );
}
