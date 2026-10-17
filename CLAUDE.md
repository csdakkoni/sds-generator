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
- Ortak (global) madde havuzu yalnızca saf madde verisi içerir; hangi firmanın hangi hammaddeyi kullandığı bilgisi asla ortak alana taşınmaz.

## Veri kaynakları ve öncelik

1. **SEA Yönetmeliği Ek-6** (harmonize sınıflandırma), Resmî Gazete'deki resmi metinden. Yalnızca listelenen tehlike sınıfları için bağlayıcıdır; listelenmeyen sınıflar ayrıca değerlendirilir.
2. **Hammadde tedarikçisinin SDS'i**: yapay zekâ ile okunur, her değer sayfa numarası ve kaynak metin alıntısıyla saklanır, uzman onayından sonra kullanılır.
3. **Karışıma ait ölçülmüş veriler** (parlama noktası, pH, yoğunluk vb.): laboratuvar sonucu olarak girilir.
4. **PubChem**: yalnızca kimlik eşleştirme (CAS, isim, eş anlamlılar) ve araştırma desteği. Sınıflandırma kaynağı olarak kullanılmaz.

Kullanılmayacak kaynaklar: ECHA'nın Ek VI Excel tablosu (ticari kullanım kısıtı var), IFA GESTIS (ticari aktarım yasak), C&L envanterindeki "çoğunluk bildirimi".

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
