# SDS Projesi: Başlangıç Promptları

Önce `CLAUDE.md` dosyasını yeni projenin kök klasörüne koy. Promptları sırayla, her biri bitip sen sonucu kontrol ettikten sonra ver. Her adımın sonunda "Kontrol et" maddesine bakmadan bir sonrakine geçme.

---

## 0. Kurulum ve plan

```
CLAUDE.md dosyasını oku. Henüz kod yazma.

1. Projenin klasör yapısını öner: Vite + React + TypeScript uygulaması, ayrı bir
   `packages/classification-engine` paketi, `supabase/` (migrations, functions),
   `scripts/` ve `tests/reference-cases/`.
2. Eski projedeki (/Users/erdemaslan/Desktop/projeler/kimya-erp-live) CLAUDE.md'de
   "taşınabilir" diye işaretlenen dosyaları incele; her biri için neyin alınacağını,
   neyin temizleneceğini listele.
3. Aşağıdaki adımlar için kısa bir yol haritası çıkar ve bana onaylat:
   belge okuma denemesi → sınıflandırma motoru → veritabanı şeması → SEA Ek-6
   aktarımı → arayüz ve PDF → onay ve revizyon akışı → fason ve etiket.

Onayımdan sonra iskeleti kur: Vite + React + TS + Tailwind, workspace yapısı,
lint ve test (Vitest) altyapısı. Uygulama boş bir sayfa açsın, testler çalışsın.
```

**Kontrol et:** `npm run dev` açılıyor mu, `npm test` çalışıyor mu?

---

## 1. Tedarikçi SDS okuma denemesi (arayüzsüz)

Bu, ürünün asıl değerini ölçen deney. Klasöre 10 farklı tedarikçi SDS'i koy: ticari karışım (SLES, etoksilat), aralıklı konsantrasyon, biyositli bir hammadde, bir asit veya baz, bir saf madde ve en az bir taranmış PDF.

```
`scripts/extract-supplier-sds/` altında, verilen klasördeki tedarikçi SDS PDF'lerini
okuyup her biri için yapılandırılmış JSON üreten bir komut satırı aracı yaz.

Çıkarılacak alanlar:
- Hammadde kimliği: ticari ad, tedarikçi, SDS revizyon tarihi ve numarası, dil.
- Hammaddenin kendi sınıflandırması (Bölüm 2): tehlike sınıfı, kategori, H kodu.
- Bileşenler (Bölüm 3): ad, CAS, EC, konsantrasyon (alt ve üst sınır ayrı alanlar,
  aralık değilse ikisi eşit), sınıflandırma, SCL, M-faktörü, ATE, kayıt numarası.
- Fiziksel özellikler (Bölüm 9): değer, birim, test yöntemi varsa.
- Taşımacılık (Bölüm 14): UN no, sınıf, ambalaj grubu.

Kurallar:
- Her değerin yanında sayfa numarası ve kaynak metinden kısa bir alıntı olsun.
- Belgede bulunmayan alan `null` ve "belirtilmemiş" olarak kalsın; tahmin etme.
- Hammaddenin sınıflandırması ile bileşenlerin sınıflandırması karıştırılmasın.
- Belirsiz, çelişkili veya okunamayan her nokta bir `flags` listesine yazılsın.
- Model çağrısı bir arayüzün arkasında olsun (sağlayıcı değiştirilebilir); API
  anahtarı ortam değişkeninden okunsun.
- Çıktı şemasını önce bir TypeScript tipi ve JSON Schema olarak yaz, bana göster.

Sonunda tüm belgeler için bir özet tablo üret: belge başına bileşen sayısı,
bayraklı alan sayısı, işlem süresi.
```

**Kontrol et:** Çıktıları KDU arkadaşının çıktıyı görmeden hazırladığı referansla karşılaştırın. Hatalı ve eksik alanları, düzeltmeye harcanan süreyi not edin. Sonraki adımın sonuçları bu notlara göre şekillenecek.

---

## 2. Sınıflandırma motoru

```
`packages/classification-engine` paketini sıfırdan, testlerle yaz. Eski projedeki
motordan kod kopyalama; yalnızca hangi kuralları kapsadığını referans olarak kullan.

Girdi: bileşen listesi (her biri için konsantrasyon aralığı ve onaylı sınıflandırma:
tehlike sınıfı, kategori, H kodu, SCL, M-faktörü, ATE) + karışıma ait ölçülmüş
veriler (parlama noktası, kaynama noktası, pH vb.).

Çıktı: nihai sınıflandırma (sınıf, kategori, H kodu), piktogramlar, uyarı kelimesi,
P ifadeleri önerisi, uyarılar (eksik veri, belirsizlik) ve her sonuç için gerekçe izi.

Kapsam (ilk sürüm): cilt aşındırma/tahriş, ciddi göz hasarı/tahrişi (toplama
yöntemi ve SCL ile), akut toksisite (ATE karışım formülü), solunum ve cilt
hassaslaştırması, CMR, STOT SE ve RE, aspirasyon, sucul ortam (M-faktörlü toplama).
Fiziksel tehlikeler yalnızca ölçülmüş veriden; veri yoksa "belirlenemedi" uyarısı.

Aralık yönetimi: her hesabı alt ve üst sınır için ayrı yap. İki sınır farklı sonuç
veriyorsa bunu açıkça raporla ve hangi varsayımın uygulandığını yaz.

Testler (her biri CLP tablosuna referanslı):
- %10–20 Eye Dam. 1 bileşen, pH 7 → H318, GHS05, TEHLİKE (pH bunu değiştirmemeli).
- STOT RE 1 bileşen ≥%10 → H372 ve TEHLİKE.
- %0,002 CMIT/MIT (SCL: Skin Sens. 1A ≥%0,0015) → H317.
- NaOH %2,5 (SCL: Skin Corr. 1B %2–5) → H314.
- Sucul akut 1 bileşen, M=100, %0,3 → sucul sınıflandırma tetiklenir.
- Yanıcı bileşen içeren, parlama noktası girilmemiş karışım → uyarı, H22x yok.
- Eksik ATE verisi → uyarı, "tehlike yok" sonucu değil.

Emin olmadığın her eşik veya kural için kodu yazma, `TODO(KDU)` olarak listele.
```

**Kontrol et:** Testlerin listesini KDU arkadaşına gösterin. `TODO(KDU)` listesini birlikte kapatın. Referans vakaları `tests/reference-cases/` altına ekleyin.

---

## 3. Veritabanı şeması ve erişim kuralları

```
Supabase için şemayı ve RLS kurallarını migration olarak yaz:

- organizations, organization_members (rol: owner, editor, kdu, viewer)
- substances: saf madde kimliği (CAS, EC, isimler, eş anlamlılar); global
- substance_classifications: kaynak türü (sea_annex6 | supplier_sds | expert),
  kaynak referansı, geçerlilik, onaylayan, onay tarihi
- raw_materials: firmaya ait ticari hammadde (ticari ad, tedarikçi)
- raw_material_sds_documents: yüklenen tedarikçi SDS'i (Storage yolu, revizyon),
  çıkarılan JSON, bayraklar, onay durumu
- raw_material_components: bileşen ve konsantrasyon aralığı (alt/üst)
- products ve recipe_lines: ürün reçetesi (hammadde ve yüzde)
- product_measurements: ölçülmüş laboratuvar verileri
- sds_documents: sabit doküman numarası, ürün, dil, durum (taslak | incelemede |
  yayında | geçersiz)
- sds_revisions: revizyon no, içerik özeti, motor sürümü, kullanılan kaynaklar,
  gerekçe izi, onaylayan KDU ve tarih, PDF yolu
- audit_log

Her tabloda RLS açık olsun; global tablolar herkese okuma, yalnızca yöneticiye
yazma izni versin. Firma verisine başka firmanın üyesinin erişemediğini doğrulayan
testler yaz (iki kullanıcı, iki firma).
```

**Kontrol et:** RLS testleri geçiyor mu? Supabase panelinde her tabloda RLS açık mı?

---

## 4. SEA Ek-6 aktarımı

```
`scripts/import-sea-annex6/` altında, SEA Yönetmeliği Ek-6'nın Resmî Gazete'deki
resmi metninden harmonize sınıflandırmaları (madde adı, CAS, EC, tehlike sınıfı ve
kategori, H kodları, SCL, M-faktörleri, ATE, notlar) okuyup `substances` ve
`substance_classifications` tablolarına aktaran bir araç yaz.

- Kaynak belgenin sürümünü ve tarihini kaydet; aktarım tekrar çalıştırılabilir olsun.
- Okunamayan veya şüpheli satırları ayrı bir rapora yaz.
- KDU kontrolü için rastgele 40 satırlık bir örneklem çıktısı üret.
- ECHA'nın Excel tablosunu kullanma.
```

**Kontrol et:** KDU 40 satırlık örneklemi kontrol etsin. Hata oranı kabul edilebilir mi?

---

## 5. Arayüz ve PDF

```
Temel akışı kur:
1. Hammadde SDS'lerini toplu yükleme → çıkarım → yalnızca bayraklı alanları gösteren
   inceleme ekranı (sol: kaynak PDF sayfası, sağ: çıkarılan değer) → onay.
2. Reçete girişi ve Excel'den reçete aktarımı.
3. Ürün sayfası: motor sonucu, gerekçe izi, uyarılar.
4. SDS PDF (TR/EN): eski projedeki SDSDocument düzenini taşı ve temizle. PDF yalnızca
   motorun sonucunu ve onaylı verileri gösterir; kendi başına hiçbir sınıflandırma
   kararı vermez. Bölüm 3.2'de sınıf/kategori ve kayıt numarası, Bölüm 16'da H
   ifadelerinin tam metni ve revizyon notu bulunsun. Tüm alt bölümler (4.2, 4.3,
   10.3, 10.6, 12.5, 12.6, 15.2 dahil) eksiksiz olsun.
```

**Kontrol et:** Eski sistemdeki "grosol m" ürününü yeni sistemde oluşturun. Doğru sınıflandırma çıkıyor mu (H318, GHS05, TEHLİKE)? KDU örnek PDF'i kontrol etsin.

---

## 6. Onay, revizyon ve değişiklik takibi

```
- SDS durumu: taslak → incelemede → (KDU onayı) → yayında.
- Onaylanan her revizyon değişmez olarak saklansın; doküman numarası sabit kalsın.
- Bir hammaddenin yeni SDS'i yüklendiğinde, onu kullanan tüm ürünleri bul, yeni
  taslak revizyonları hazırla ve "revizyon gerekiyor" listesine ekle.
- Yayındaki her SDS için en güncel sürüme yönlendiren bir QR kod bağlantısı üret.
```

---

## 7. Fason ve etiket

```
- Fason / private label: bir ürün için birden fazla müşteri profili (firma adı,
  adres, logo, acil durum telefonu). Aynı onaylı içerikten her müşteri için ayrı SDS
  üret; içerik değiştiğinde hepsi birlikte revize edilsin.
- GHS etiketi: nihai sınıflandırmadan piktogramlar, uyarı kelimesi, H/P ifadeleri,
  tehlikeli bileşen adları; ambalaj boyutuna göre şablon seçimi; yazdırılabilir PDF.
```

---

## İnceleme promptu (her büyük adımdan sonra)

```
Bu adımda yazdığın kodu CLAUDE.md'deki "Değiştirilemez kurallar" listesine karşı
madde madde denetle. Her kural için: uyuyor / uymuyor / kapsam dışı. Uymayanları
düzelt. Mevzuatla ilgili yaptığın her varsayımı kaynağıyla birlikte listele.
```
