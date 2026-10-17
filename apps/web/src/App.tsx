import { ENGINE_VERSION } from '@sds/classification-engine';

export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">SDS Hazırlama Sistemi</h1>
        <p className="mt-2 text-sm text-slate-500">Sınıflandırma motoru sürümü {ENGINE_VERSION}</p>
      </div>
    </main>
  );
}
