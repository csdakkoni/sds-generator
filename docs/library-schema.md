# Madde kütüphanesi şeması (Adım 1 taslağı)

Durum: **onayınla veritabanına uygulandı (2026-10-19, migration `library_profiles`).**
Dosyalar: `supabase/migrations/20261019020000_library_profiles.sql`, `packages/library-schema/`, testler `supabase/tests/library.test.sql`.

## Ne değişiyor

Bir maddenin kimliği (CAS, EC, isimler) `substances` tablosunda aynen kalır. Sınıflandırma artık doğrudan maddeye değil, maddeye bağlı **profillere** bağlanır. Aynı CAS için birden çok profil olabilir (ör. farklı EO derecesi, farklı aktif madde aralığı).

| Tablo | Rol |
| --- | --- |
| `substances` (mevcut) | Madde kimliği; değişmez. |
| `classification_profiles` (yeni) | Bir maddenin bir profili: kaynak türü, lisans, doğrulama durumu, uygulanma koşulları (EO/PO derecesi, karbon zinciri, aktif madde aralığı, safsızlık koşulları). |
| `substance_classifications` (mevcut) | Sınıflandırma satırları (sınıf, kategori, H kodu, SCL, M-faktörü, ATE). Yeni `profile_id` sütunuyla bir profile bağlanır. |
| `regulation_versions` (yeni) | Mevzuat sürümleri (kaynak belge, Resmî Gazete tarihi/sayısı, yürürlük, geçiş süresi). Silinmez, `effective_to` ile kapatılır. |
| `regulatory_sources` (yeni) | Adım 5 için izlenen kaynaklar (Resmî Gazete günlük indeksi, anahtar kelimeler). |
| `regulatory_change_events` (yeni) | Adım 5 için tespit edilen olası mevzuat değişiklikleri. Hiçbirini kendi başına uygulamaz. |
| `kdu_review_queue` (yeni) | KDU kontrol listesi: profil çelişkisi, tedarikçi SDS eşleşmesi, taslak profil, mevzuat değişikliği, taslak revizyon, veri boşluğu. |

## Kaynak türleri ve kurallar (veritabanı bunları zorlar)

- `harmonised` (SEA Ek-6): firmaya ait olamaz, mevzuat sürümüne bağlı olmak zorunda, bir maddenin yürürlükteki tek bir harmonize profili olabilir.
- `industry_guidance` (CESIO vb.) ve `shared_pool`: yalnızca ortak (firmasız) veri.
- `supplier_sds`: yalnızca bir firmaya ait.
- `expert_rule`: koşul metni ve gerekçe zorunlu.
- `research_note`: doğrulanamaz ve sınıflandırma satırı taşıyamaz; hesaba giremez.
- `classification_system`: `clp` ve `un_ghs` ayrı profillerdir. Türkiye hesabı yalnızca `clp` kullanır (`isCalculationEligible`).
- Doğrulama: `verified` durumu doğrulayan kişiyi ve zamanı ister. Doğrulayan oturumdaki kişi olmak zorundadır; firma verisini KDU, ortak veriyi platform yöneticisi doğrular.
- Lisansı doğrulanmamış (`data_license = unverified`) ortak profiller ve satırları yalnızca platform yöneticisine görünür. Bu, "geliştirme ortamında kullan" kuralının şimdilik karşılığıdır (ayrı ortam yok, bkz. CLAUDE.md açık kararlar).
- KDU kuyruğunu yalnızca firmanın KDU rolü görür (UX ilkesi 2); platform düzeyi kayıtları platform yöneticisi görür.

Eski sütunlar (`source_type` sınıflandırma satırında) kaldı: `harmonised` → `sea_annex6`, `supplier_sds` → `supplier_sds`, diğer katmanlar `expert` olarak yazılır; asıl kaynak profildir ve tetikleyici ikisinin uyumunu denetler. Böylece mevcut kısıtlar silinmeden (DROP gerektirmeden) genişletildi.

## Mevcut Ek-6 verisi nasıl taşınır

Bugün veritabanında 4.258 Ek-6 maddesi (kimlik) var, hiç sınıflandırma satırı yok (0). Hesaplamada kullanılabilir yapılandırılmış sınıflandırma, CLAUDE.md kural 3 ve KDU incelemesi gereği henüz yazılmadı. Plan:

1. Bir `regulation_versions` kaydı oluşturulur (SEA Ek-6). Resmî Gazete tarihi/sayısı sende teyit edilecek (aşağıda TODO).
2. Her Ek-6 maddesi için bir `harmonised` profil oluşturulur: durum `pending`, lisans `official_public`, `source_reference` = Ek-6 liste no, `source_snapshot` = dosyadaki ham metinler (sınıflandırma metni, H kodu listesi, etiket H, EUH, piktogram, uyarı kelimesi).
3. Sınıflandırma satırları (sınıf/kategori/H kodu) bu aşamada yazılmaz; KDU incelemesinden sonra yapılandırılmış olarak girilir. O zamana kadar profil `pending` kalır ve hesaba girmez.
4. İşi mevcut `import-ek6` fonksiyonu yapacak (profil ve ham metin yazımı eklenecek); önce kuru çalıştırma sayıları gösterilecek.

Dosyadaki durum (4.258 kayıt): sınıflandırma metni 4.258, H kodu listesi 4.256 (2 kayıtta boş), etiket H 4.253, EUH 134, uyarı kelimesi 3.919, piktogram 4.017, CAS 3.503, EC 3.828. Boş kalan kayıtların nedenleri Adım 2'de ayrıca incelenecek.

## CLAUDE.md denetimi (12 değiştirilemez kural)

| Kural | Durum | Not |
| --- | --- | --- |
| 1 Sınıflandırma yalnızca motorda | Uyuyor | Şema yalnızca veri tutar; `isCalculationEligible` sadece hangi profilin girebileceğini söyler. |
| 2 pH ile düşürme yok | Kapsam dışı | |
| 3 H kodu regex ile toplanmaz | Uyuyor | Ham metin `source_snapshot`ta saklanır, kodlar yapılandırılmış sütunlara KDU incelemesiyle girer. |
| 4 Aralıklar aralık kalır | Uyuyor | Aktif madde, EO/PO ve karbon zinciri min/maks olarak tutulur. |
| 5 Eksik veri ≠ tehlike yok | Uyuyor | `data_gap` kuyruk türü ve `pending` profil hesaba girmez. |
| 6 Fiziksel tehlike toplanmaz | Kapsam dışı | |
| 7 Uyarı kelimesi/piktogram türetilir | Kapsam dışı | Ek-6'daki etiket alanları yalnızca ham metin olarak saklanır. |
| 8 SCL, M-faktörü, ATE | Uyuyor | Mevcut sütunlar satırlarda korunuyor. |
| 9 Gerekçe izi | Kapsam dışı | Profilde `source_reference` ve `rationale` mevcut. |
| 10 Doküman/revizyon numarası | Uyuyor | Dokunulmadı; `regulation_versions` silinmez. |
| 11 KDU onayı olmadan yayın yok | Uyuyor | Doğrulayanın kimliği ve rolü tetikleyiciyle zorlanır; yayın tetikleyicisine dokunulmadı. |
| 12 Koşullu şablon metni | Kapsam dışı | |

## Varsayımlar ve kaynakları

1. Türkiye hesabı yalnızca CLP kullanır; UN GHS ayrı tutulur. Kaynak: senin talimatın (13:16 mesajı).
2. Ek-6 yalnızca listelenen sınıflar için bağlayıcıdır. Kaynak: CLAUDE.md, Veri kaynakları madde 1.
3. Ortak havuza giriş (3 firma veya platform KDU onayı) bu adımda uygulanmadı; şema `shared_pool` türünü taşıyor. Kaynak: CLAUDE.md.
4. Lisansı belirsiz verinin yalnızca platform yöneticisine görünmesi bir tasarım tercihimdir; ayrı geliştirme ortamının yerine geçici çözümdür.
5. Bir maddenin aynı anda tek yürürlükte harmonize profili olması: Ek-6'da liste no benzersiz, bu yüzden her kayıt kendi maddesine gider. Aynı CAS'ın birden çok Ek-6 satırında geçtiği 25 durumda ikinci satıra CAS yazılmamıştı (daha önce belgelendi).

## TODO(KDU)

- TODO(KDU): Ek-6 için Resmî Gazete tarihi/sayısı, yürürlük tarihi ve geçiş süresi teyit edilmeli (`regulation_versions` kaydı bunlarsız açılmayacak).
- TODO(KDU): `industry_guidance`, `expert_rule`, `supplier_sds`, `shared_pool` profilleri çeliştiğinde kuyrukta çelişki kaydı açılır, motor seçmez (karar: 3. soru, hayır/evet/evet).
- TODO(KDU): Ek-6 profillerinin `pending` → `verified` geçişi için KDU inceleme düzeni (toplu mu, madde madde mi) belirlenmeli.
