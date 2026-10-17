# Yol haritası ve eski proje incelemesi

Adım 0 planı (onaylandı: 2026-10-17). Eski projeden dosya taşıma 5. adımda yapılacak.

## 1. Önerilen klasör yapısı

```
sds-generator/
├─ CLAUDE.md                         kalıcı kurallar (yüklediğiniz dosya)
├─ package.json                      npm workspaces: apps/*, packages/*
├─ apps/
│  └─ web/                           Vite + React + TS + Tailwind, Türkçe arayüz
│     ├─ public/{ghs,fonts,icons}    5. adımda taşınacak varlıklar
│     └─ src/
│        ├─ app/                     yönlendirme, düzen
│        ├─ features/                hammaddeler, ürünler, sds, etiket…
│        ├─ pdf/                     SDS ve etiket PDF bileşenleri (yalnızca gösterim)
│        └─ lib/                     supabase istemcisi, yardımcılar
├─ packages/
│  └─ classification-engine/         saf TS; arayüz ve veritabanından bağımsız
│     ├─ src/
│     └─ test/                       CLP/SEA tablosuna referanslı birim testleri
├─ supabase/
│  ├─ migrations/                    şema + RLS (3. adım)
│  └─ functions/                     Edge Functions: belge okuma vb.
├─ scripts/
│  ├─ extract-supplier-sds/          1. adım CLI
│  └─ import-sea-annex6/             4. adım aktarım aracı
├─ tests/
│  └─ reference-cases/               KDU onaylı reçete → beklenen sınıflandırma
└─ docs/
   ├─ baslangic-promptlari.md
   ├─ roadmap.md                     bu yol haritası
   └─ kdu-todo.md                    TODO(KDU) listesi
```

Seçtiğim varsayılanlar:
- **npm workspaces** (ek araç gerektirmez). Kökten `npm run dev` ve `npm test` çalışır.
- H/P ifade metinleri 5. adımda ayrı bir paket olur (`packages/ghs-phrases`), çünkü PDF, etiket ve ileride ERP aynı metinleri kullanacak. Motor yalnızca kod üretir, metin tutmaz.
- Tedarikçi SDS PDF'leri depoya girmez (üçüncü taraf belgeleri). `.gitignore`'da `samples/` klasörü olur.
- GitHub Actions ile her push'ta lint + test + build çalışır.
- Her adım ayrı bir PR olarak gelir; birleştirmeden önce siz kontrol edersiniz.

## 2. Eski projeden taşınabilir dosyaların incelemesi

GitHub'daki `csdakkoni/kimya-erp` deposunu inceledim. CLAUDE.md'deki yolların hepsi birebir orada, paket adı aynı ürünü gösteriyor, son commit 14 Ekim 2026. Bu yüzden Mac'teki `kimya-erp-live` ile aynı proje kabul ettim. Mac'te commit edilmemiş değişiklik varsa onları görmedim.

### `src/components/sds/pdf/SDSDocument.jsx` (1077 satır)

**Alınacak:** 16 bölümlük sayfa düzeni ve stiller, TR/EN bölüm başlıkları, Bölüm 9 ve 14 tablo düzenleri, Bölüm 16 kısaltma tablosu, KDU bilgi kutusu, sayfa altlığı (sayfa X / Y). TypeScript'e yeniden yazılacak ve tek bir "onaylı SDS içeriği" nesnesini alacak; kendi başına hiçbir hesap yapmayacak.

**Temizlenecek (kural numarasıyla):**
| Ne | Nerede | Kural |
|---|---|---|
| Nötr pH'ta H314/H318 kaldırma, H315/H319 ekleme, GHS05→GHS07, TEHLİKE→DİKKAT, P ifadelerini değiştirme | satır 460–601 | 1, 2, 7 |
| pH tahmini (bileşen adında "ACID"/"SODYUM" arayarak "1.0–2.0" veya "12.0–13.5" yazma; varsayılan "7.0–8.0") | 491–538 | 2, 5, 6 |
| Yoğunluk, kaynama noktası tahmini ("~1.0 g/cm3 salt tahmini", "~100°C su bazlı") | 474–518 | 5, 6 |
| Varsayılan renk "Berrak/Renksiz", çözünürlük "Tamamen çözünür", görünüm "Sıvı" | 451–574 | 5 |
| Formik asit için sabit H kodu listesi, NaOH ad değiştirme, su için sınıflandırma yok sayma | 752–774, 934 | 1, 3 |
| Bölüm 14'te H314 varsa UN1760 / sınıf 8 / PG III varsayma | 540–561 | 1, 6 |
| H kodundan kategori çıkarma (`hazard_categories`): H314 hep "Kategori 1" oluyor, 1A/1B/1C kayboluyor | 627–630 | 1, 7 |
| Konsantrasyonu kovaya yuvarlama (`getConcentrationRange`): %12 → "10–20" | 34–53 | 4 |
| Eski firma adı ve teması, rakip firma adına atıf | 149, 361–362, 605, 649 | Ürün kuralı |
| "Otomatik oluşturulmuştur" ibaresi ve "Kimya ERP SDS Otomasyon Modülü" altlığı | 162, 377–379 | 12 |
| Koşulsuz sabit cümleler: 12.2 "inorganik tuz ve bazlar bozunmaz", 2.3 "PBT/vPvB içermez", 12.3 "biyobirikim beklenmez", 15.1 ozon cümlesi | çeşitli | 12, 5 |
| Form No zaman damgasından rastgele üretiliyor, revizyon tarihi = bugünün tarihi | 652–654 | 10 |

**Eksik olup eklenecek:** 4.2, 4.3, 10.3, 10.6, 12.5, 12.6, 15.2 alt bölümleri; Bölüm 3.2'de sınıf/kategori ve kayıt numarası; Bölüm 16'da H ifadelerinin tam metni ve revizyon notu. İngilizce alt başlık "UN GHS / REACH" diyor, KKDİK'e göre düzeltilecek.

### `src/utils/sds/safety_phrases.json` ve `safety_phrases_en.json`

**Alınacak:** 64 H ve 118 P ifadesi; TR ve EN anahtarları birebir eşleşiyor.

**Temizlenecek / eksikler:**
- H316 ve H320 GHS'de var ama SEA/CLP'de yok; çıkarılacak.
- Eksikler: EUH ifadeleri (EUH208, EUH210, EUH071 vb.), H360F/D/FD/Fd/Df, H361f/d/fd, H350i, birleşik H ifadeleri (H300+H310 vb.) ve bazı P ifadeleri.
- `hazard_categories` haritası alınmayacak (yukarıdaki kategori kaybı sorunu; EN'de H334–H336 da eksik). Sınıf ve kategori adları motordan gelecek.
- Metinlerin SEA Ek-III resmi metniyle satır satır karşılaştırılması gerekiyor. Bunu `TODO(KDU)` olarak listeye alıyorum.

### `public/ghs/*_official.svg`

**Alınacak:** 9 piktogram (GHS01–GHS09). Klasördeki diğer 37 dosya (`_backup.png`, `_new.png`, `.svg.png`, `test_flame.png`) alınmayacak. Eski PDF PNG kullanıyordu; yeni PDF'te SVG'den üretilen PNG ya da doğrudan react-pdf `Svg` kullanılacak.

### `public/icons/*`

**Sorun:** 4 PNG dosyası (gloves, goggles, mask, suit) aslında resim değil, yanlış indirilmiş HTML sayfaları. Kullanılamaz. Yalnızca `goggles.svg` geçerli. KKD ikonları için `PPEIcons.jsx` yeterli, bu klasörü almayı önermiyorum.

### `public/fonts/*`

**Alınacak:** Roboto Regular ve Bold (Apache 2.0 lisanslı, Türkçe karakterleri destekliyor). Lisans dosyası eklenecek.

### `src/components/sds/pdf/PPEIcons.jsx`

**Alınacak:** 4 KKD ikonu (gözlük, eldiven, maske, tulum), TypeScript'e çevrilerek.
**Alınmayacak:** `TransportRhombus` (sınıf 8 görseli yarım ve yanlış) ve `OrangePlate` (varsayılan "80 / 1824" NaOH değerleri sabit). SDS'te zaten gerekmiyorlar.

## 3. Yol haritası

| Adım | İçerik | Sizden gereken | Kontrol |
|---|---|---|---|
| 0. İskelet | Workspaces, boş sayfa açan web uygulaması, boş motor paketi, TS strict, ESLint + Prettier, Vitest, GitHub Actions | Bu planın onayı | `npm run dev`, `npm test` |
| 1. Belge okuma denemesi | Önce çıktı şeması (TS tipi + JSON Schema) onayınıza; sonra CLI. Model bir arayüzün arkasında, anahtar ortam değişkeninden | Bir yapay zekâ API anahtarı; Masaüstü'ndeki "adsız klasör"e erişim izni; mümkünse 10 SDS (şu an 4) | KDU referansıyla karşılaştırma |
| 2. Sınıflandırma motoru | Sıfırdan, testlerle; aralıkların alt/üst sınırı ayrı; her sonuç gerekçe iziyle | Yok (PDF gerektirmez) | Test listesi ve TODO(KDU) KDU ile |
| 3. Veritabanı + RLS | Migration'lar, iki firma / iki kullanıcı RLS testleri | Supabase projesi oluşturma onayı (ücret çıkarsa önce sorarım) | RLS testleri, panelde RLS açık |
| 4. SEA Ek-6 aktarımı | Resmî Gazete metninden; tekrar çalıştırılabilir; şüpheli satır raporu; 40 satırlık örneklem | Yok | KDU örneklem kontrolü |
| 5. Arayüz ve PDF | Toplu SDS yükleme, bayraklı alan incelemesi, reçete (Excel dahil), ürün sayfası, TR/EN PDF (yukarıdaki temizlikle) | Yok | "grosol m" → H318, GHS05, TEHLİKE |
| 6. Onay ve revizyon | Taslak → incelemede → KDU onayı → yayında; değişmez revizyonlar; etkilenen ürün listesi; QR bağlantısı | Yok | Akış denemesi |
| 7. Fason ve etiket | Müşteri profilleri, aynı içerikten çoklu SDS, ambalaj boyutuna göre GHS etiketi | Yok | Örnek etiket |

Sıra şu anki durumunuza göre: 0'dan sonra, SDS'ler ve API anahtarı hazır olana kadar 2. adıma geçip 1'i paralel yürütebiliriz.
