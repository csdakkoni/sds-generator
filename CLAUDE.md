# Proje: SDS Hazırlama ve Yönetim Sistemi

Bu dosya, bu projede çalışan yapay zekâ asistanı için kalıcı bağlamdır. Her oturumda önce bunu oku.

## Ürün

Butik kimya üreticileri (tekstil yardımcıları, deterjan/temizlik, endüstriyel kimyasallar) için, reçeteden Türkiye mevzuatına (KKDİK Ek-2, SEA) uygun Güvenlik Bilgi Formu (GBF/SDS) ve GHS etiket taslağı üreten, KDU onaylı bir sistem.

Temel vaat: "Hammadde SDS klasörünü ve reçete Excel'ini yükle; sistem hammadde kütüphaneni kursun, yalnızca eksik ve çelişkili noktaları sorsun; SDS'lerin, etiketlerin ve fason müşteri versiyonların hazır olsun; bir hammadde değiştiğinde etkilenen ürünleri sistem bulsun."

- Kullanıcılar: üretici firma çalışanları ve Kimyasal Değerlendirme Uzmanı (KDU). SDS'i KDU onaylar; sistem KDU'nun yerine geçmez, onun işini hızlandırır.
- Bu ürün, Grohn Kimya'dan bağımsız bir üründür. Kodda, şablonda veya veride Grohn, müşteri ya da rakip firma adı (ör. Pulcra, Akkim) bulunmamalı.

## Teknoloji

- Vite + React + TypeScript, Tailwind. Backend: Supabase (Postgres, Auth, Storage, Edge Functions).
- Sınıflandırma motoru: arayüzden ve veritabanından bağımsız, saf TypeScript paketi (`packages/classification-engine`). Hem bu ürün hem ileride ERP aynı paketi kullanır.
- Yapay zekâ ile belge okuma yalnızca sunucu tarafında (Edge Function) çalışır. Model sağlayıcısı bir arayüzün arkasında soyutlanır; API anahtarları asla istemci koduna (`VITE_` önekli değişkenlere) girmez.
- PDF üretimi: @react-pdf/renderer.
- Arayüz dili Türkçe; kod, değişken adları ve commit mesajları İngilizce. SDS çıktıları TR ve EN.

## Çok firmalı yapı

- Her veri bir `organization`a aittir. Erişim Postgres RLS kurallarıyla firma üyeliğine göre sınırlandırılır; istemci tarafı filtre güvenlik sayılmaz.
- Roller: owner, editor, kdu (onay yetkili), viewer.
- Ortak (global) madde havuzu yalnızca saf madde verisi içerir; hangi firmanın hangi hammaddeyi kullandığı bilgisi asla ortak alana taşınmaz. Havuza giriş koşulları için "Madde kütüphanesi ve kaynak katmanları" bölümüne bak.

## Veri kaynakları ve öncelik

Aşağıdaki liste kaynakların rolünü özetler. Kaynak katmanları (source_type), profil kuralları ve ortak havuz için "Madde kütüphanesi ve kaynak katmanları" bölümü geçerlidir.

1. **SEA Yönetmeliği Ek-6** (harmonize sınıflandırma), Resmî Gazete'deki resmi metinden. Yalnızca listelenen tehlike sınıfları için bağlayıcıdır; listelenmeyen sınıflar ayrıca değerlendirilir.
2. **Hammadde tedarikçisinin SDS'i**: yapay zekâ ile okunur, her değer sayfa numarası ve kaynak metin alıntısıyla saklanır, uzman onayından sonra kullanılır.
3. **Karışıma ait ölçülmüş veriler** (parlama noktası, pH, yoğunluk vb.): laboratuvar sonucu olarak girilir.
4. **PubChem**: kimlik eşleştirme (CAS, isim, EC) ve dış kaynak olarak, PubChem'in yeniden yayımladığı kaynak bazlı GHS kayıtları (Japonya NITE, Yeni Zelanda EPA vb.; ECHA C&L bildirimleri hariç). Tek başına kaynak değildir: bağımsız kaynaklar karşılaştırılır, taslakta kullanılır, KDU onayı olmadan SDS kesinleşmez (bkz. Açık kararlar, 2026-10-24).

Kullanılmayacak kaynaklar: ECHA'nın Ek VI Excel tablosu (ticari kullanım kısıtı var), IFA GESTIS (ticari aktarım yasak), C&L envanterindeki "çoğunluk bildirimi" (PubChem'in ECHA kayıtları dahil).

## Madde kütüphanesi ve kaynak katmanları

- Bir maddenin kimliği (CAS, EC, Index No, isimler) tektir. Sınıflandırma kayıtları ayrıdır ve aynı CAS için birden çok profil olabilir (1:N).
- Profil seçim alanları: EO/PO derecesi, karbon zinciri, aktif madde aralığı, safsızlık koşulları.
- Her sınıflandırma kaydında: `jurisdiction` (şimdilik yalnızca TR), `regulation`, `source_type`, `source_reference` (belge, sayfa, satır), `data_license`, `effective_from`, `effective_to`, `verification_status`, `verified_by`, `verified_at`.
- `source_type` değerleri:
  - `harmonised`: SEA Ek-6. Kilitli; KDU listelenen tehlike sınıflarını düşüremez. Listelenmeyen sınıflar ayrıca değerlendirilir.
  - `industry_guidance`: CESIO gibi sektör rehberleri; profil olarak önerilir.
  - `expert_rule`: KDU'nun yazdığı koşullu profiller. Koşul ve gerekçe zorunlu (ör. PDMS: "D4, D5, D6 her biri < %0,1 ise sınıflandırılmaz").
  - `shared_pool`: anonim CAS + sınıflandırma + koşul profilleri.
  - `supplier_sds`: firmaya özel ticari grade bilgisi.
  - `research_note`: PubChem ve diğer araştırma kaynakları (C&L çoğunluk bildirimi hariç). Otomatik hesaba asla girmez.
- Ortak havuz: bir profil 3 farklı firmada görüldüğünde VEYA platform KDU'su onayladığında anonim olarak ortak havuza girer. Ticari ad, tedarikçi adı ve firma bilgisi asla taşınmaz. TODO: Kullanım koşullarına müşteri onayı maddesi eklenecek.
- Araştırma notunda "Taslağa aktar" düğmesi bulunur. KDU onaylarsa kaynak "expert_assessed (research_note referanslı)" olarak kaydedilir.
- Tedarikçi SDS'i yüklendiğinde mevcut profille karşılaştırılır. Tutarlıysa tek tıkla onay önerilir, farklıysa yalnızca farklar gösterilir.
- Lisansı netleşmemiş kaynaklar (CESIO dahil) `data_license=unverified` ile işaretlenir ve netleşene kadar yalnızca geliştirme ortamında kullanılır. TODO: Şu an ayrı bir geliştirme ortamı yok (tek Supabase projesi var); CESIO aktarımından önce nerede tutulacağı belirlenecek.
- ECHA CHEM'den sistematik veri çekme (scraping) yapılmaz. ECHA'nın Ek VI Excel'i ve üçüncü taraf mevzuat kopyaları ürün veritabanına aktarılmaz.

## Çoklu mevzuat

- Sistem mevzuat profilleriyle çalışır. Şimdilik yalnızca TR (SEA + KKDİK Ek-2) uygulanır. Veri modeli ve motor arayüzü ileride EU-CLP gibi profillerin eklenebileceği şekilde tasarlanır; bunlar şimdi geliştirilmez.

## Belge okuma kuralları

- H, P ve EUH ifadelerinin yalnızca kodu çıkarılır; metin her zaman veritabanındaki resmi ifade tablosundan gelir.
- Değerler orijinal dilinde ve orijinal haliyle çıkarılır; çeviri ayrı adımdır.
- ≤, ≥, <, > işaretleri ve birimler ayrı alanlarda korunur.
- CAS numaraları kontrol hanesiyle doğrulanır; tutmayanlar işaretlenir.
- Piktogramlar sınıflandırmadan türetilir; belgeden okunan piktogram yalnızca tutarlılık kontrolü içindir.

## Kullanıcı deneyimi ilkeleri

1. Onay hammadde başına bir kez verilir; onaylanan hammadde onu kullanan tüm ürünlerde yeniden sorulmaz.
2. Sınıflandırma kararlarını yalnızca KDU rolü görür ve onaylar. Diğer roller yalnızca sonuçları ve belgeleri görür.
3. Kontrol bekleyen her şey tek bir "KDU kontrol listesi"nde toplanır.
4. Bekleyen bir kontrol işi durdurmaz: taslak SDS her zaman üretilir, yalnızca "kesinleşti" durumu KDU onayına bağlıdır. Taslakta neyin beklediği açıkça yazar.
5. Otomatik eşleşen ve tutarlı kayıtlar kontrol listesine düşmez.
6. Ürün ekranında her hammaddenin yanında kaynağı tek etiketle görünür (SEA Ek-6, CESIO profili, onaylı havuz, KDU kontrolünde).
7. Toplu işlemler önceliklidir: toplu SDS yükleme, toplu onay, etkilenen ürünlerin toplu revizyonu.

## Mevzuat güncelleme süreci

- Değişiklik tespiti otomatik, yorum ve uygulama insan onaylıdır. Sistem hiçbir mevzuat değişikliğini kendi başına uygulamaz.
- Her import bir `regulation_versions` kaydı oluşturur (kaynak belge, Resmî Gazete tarihi/sayısı, yürürlük tarihi, geçiş süresi). Eski kayıtlar silinmez, `effective_to` ile kapatılır.
- Yeni sürüm yüklendiğinde etki analizi yapılır; sınıflandırması değişen ürünler için taslak revizyonlar toplu iş olarak KDU listesine düşer.

## Açık kararlar (TODO)

- Karar (2026-10-19, erdem): ECHA C&L "çoğunluk bildirimi" hiçbir biçimde gösterilmez; `research_note` olarak da girmez.
- Karar (2026-10-19, erdem): Mevcut onaylı profille tutarlı tedarikçi SDS'i için hammadde ekranında tek tıkla onay istenir (kontrol listesine düşmez, onaysız da kullanılmaz).
- Karar (2026-10-19, erdem): Aynı CAS için `harmonised` dışındaki profiller çelişirse sistem seçim yapmaz; çelişki KDU kontrol listesine düşer.
- Karar (2026-10-24, erdem): CAS yazılınca bilgi otomatik çekilir ve kütüphaneye kaydedilir. PubChem kullanılır ama tek kaynak olmaz: kaynaklar `substance_source_records` tablosunda tutulur, aynı kökenden gelenler tek oy sayılır (`family`). Onaylanana kadar taslak her sınıfta kaynakların en ağırıyla hesaplanır ve kesinleşmez. En az iki bağımsız kaynak uyumluysa KDU tek tıkla onaylar (listeye düşmez); farklıysa, tek kaynak varsa ya da veri yoksa KDU listesine düşer. KDU onayı firmaya ait `expert_rule` profili olarak kaydedilir. Lisans her kaynak için bir kez (`outside_sources`) karara bağlanır; netleşene kadar yalnızca platform yöneticisi görür.
- Karar (2026-10-24, erdem'in "ne gerekiyorsa yap" talimatıyla): Henüz doğrulanmamış (notlu/SCL'li) Ek-6 kayıtları taslakta kullanılır, SDS'i kesinleşmekten alıkoyar; madde sayfasında tek tek doğrulanır.
- TODO: Kullanım koşullarına müşteri onayı maddesi (ortak havuz).
- TODO: Ayrı geliştirme ortamı (lisansı belirsiz kaynaklar için).

## Değiştirilemez kurallar

Bu kurallar, önceki sistemde bulunan gerçek hatalardan çıkarıldı. Bunlara aykırı kod yazma; aykırı bir istek gelirse önce uyar.

1. Sınıflandırma yalnızca motorda yapılır. PDF veya arayüz bileşenleri H kodu, piktogram veya uyarı kelimesi değiştiremez; sadece motorun sonucunu gösterir.
2. pH değerine göre sınıflandırma düşürülmez. (Aşırı pH, ≤2 veya ≥11,5, yalnızca aşındırıcılık için bir gösterge olabilir; nötr pH hiçbir sınıflandırmayı kaldırmaz.)
3. H kodları bir kaynaktan metin taramasıyla (regex) toplanmaz. Her kod yapılandırılmış bir kaynaktan, kaynak bilgisiyle gelir.
4. Konsantrasyon aralıkları aralık olarak taşınır, sessizce ortalama veya tek değere çevrilmez. Motor hangi varsayımı (ör. üst sınır) kullandığını sonuçta açıkça belirtir; bunu yasal zorunluluk gibi değil, seçilmiş varsayım olarak gösterir.
5. Eksik veri "tehlike yok" demek değildir. Eksiklik sonuçta uyarı olarak görünür.
6. Fiziksel tehlikeler (yanıcılık, metal aşındırıcılık vb.) bileşen yüzdeleri toplanarak hesaplanmaz; ölçülmüş veri gerekir. Veri yoksa form kesinleşemez ve bu açıkça işaretlenir.
7. Uyarı kelimesi, piktogramlar ve P ifadeleri nihai sınıflandırmadan türetilir (ör. STOT RE 1 → TEHLİKE).
8. SCL (özel konsantrasyon sınırları), M-faktörleri ve ATE değerleri desteklenir.
9. Her sınıflandırma sonucu bir gerekçe izi (trace) üretir: "H318, çünkü Eye Dam. 1 bileşenlerin toplamı %10–20 ≥ %3 (CLP Tablo 3.3.3)".
10. SDS'in sabit bir doküman numarası ve revizyon numarası vardır; revizyon yalnızca içerik değiştiğinde artar ve değişiklikler kaydedilir.
11. Bir SDS, KDU onayı olmadan "yayınlandı" durumuna geçemez. Onaylayan kişi, tarih, kullanılan veri kaynakları ve motor sürümü kaydedilir.
12. Şablon metinler ürün tipine göre koşulludur; ürünle ilgisi olmayan sabit cümle (ör. yüzey aktif üründe "inorganik tuzlar bozunmaz") basılmaz. SDS üzerinde "otomatik oluşturulmuştur" ibaresi bulunmaz.

## Test disiplini

- Motorda her kural, ilgili CLP/SEA tablosuna referans veren birim testlerle gelir.
- `tests/reference-cases/` altında KDU tarafından doğrulanmış reçete → beklenen sınıflandırma örnekleri bulunur. Motor değişikliği bu setin tamamı geçmeden tamamlanmış sayılmaz.
- Testi geçmeyen bir kural için testi değiştirme; önce bana sor.

## Eski projeden yeniden kullanım

Eski proje: `/Users/erdemaslan/Desktop/projeler/kimya-erp-live`. Yalnızca şunlar taşınabilir, temizlenerek:

- `src/components/sds/pdf/SDSDocument.jsx`: 16 bölümlük PDF düzeni ve TR/EN metinler. İçindeki sınıflandırma mantığı (pH düşürme, uyarı kelimesi değişimi), firma adları ve sabit şablon cümleler alınmaz.
- `src/utils/sds/safety_phrases.json`, `safety_phrases_en.json`: H/P ifade metinleri (kontrol edilerek).
- `public/ghs/*_official.svg`, `public/icons/*`, `public/fonts/*`.
- `src/components/sds/pdf/PPEIcons.jsx`.

Alınmayacaklar: `calculateSDSClassification.js` (yeniden, testlerle yazılacak), `pubchemApi.js` içindeki H kodu toplama, `sanitizeHazardCodes` içindeki sabit madde istisnaları.

## Çalışma biçimi

- Küçük, gözden geçirilebilir adımlarla ilerle; her adım sonunda ne yaptığını ve neyi test ettiğini kısaca yaz.
- Mevzuatla ilgili bir varsayım yapman gerekiyorsa (eşik, kural, istisna), kaynağını belirt; emin değilsen kodu yazmadan önce sor.
- Belirsiz bir mevzuat noktasını kendi tahmininle "çözme"; `TODO(KDU)` olarak işaretle ve listede topla.
