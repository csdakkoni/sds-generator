# CESIO aktarımı: yapı analizi ve eşleştirme planı (Adım 3)

Durum: **analiz ve okuyucu hazır; veritabanına yazılmadı.** Kaynak: `Cesio-2025-CL_Recommendation_Table.xlsx` (Kasım 2025). Dosya depoya konmadı (lisansı belirsiz); okuyucu `scripts/cesio/parse_cesio.py`.

## Dosyanın yapısı

5 veri sayfası (+ bir uyarı/lisans sayfası). Her sayfada aynı 21 sütun var:

| Sütun | İçerik | Eşleştiği alan |
| --- | --- | --- |
| B, C, D | Kategori, Aile, tipik bileşen | `surfactant_family` (aile), tipik bileşen `chemical_name` yanına not |
| E | Değişiklik (C: değişti, N: yeni) | `source_snapshot.changed` |
| F | Önerilen CAS | `cas` (madde kimliği) |
| G | EC / liste no | `ec` |
| H | Kimyasal ad | `chemical_name` |
| I | Karbon zinciri (12-14, C18 doymamış...) | `carbon_chain_min/max` |
| J | EO/PO derecesi (< 2.5 EO, ≥ 2.5 - < 4 EO, 15 EO...) | `eo_po_min/max` (+ işaretler) |
| K | Form (Na, H, NH4, TEA...) | `condition_text` |
| L | Derişim / özel sınır (100, ≥ 20, 5 < C ≤ 38...) | `active_min/max` (+ işaretler) |
| M | Diğer (granül, toz...) | `condition_text` |
| N-Q | CESIO **CLP** sınıflandırması: sınıf+kategori, H ifadesi, uyarı kelimesi, piktogram | CLP profili `source_snapshot` |
| R-U | CESIO **UN-GHS** sınıflandırması (aynı 4 sütun) | ayrı UN-GHS profili `source_snapshot` |

Satır sayıları: toplam **842** veri satırı (Anionic surfact., other: 173, AS: 132, AES: 130, AE: 282, Other surfactants: 125), 35 aile. Dosyada **240** farklı geçerli CAS var; bunlardan Ek-6'da yalnızca 1 tanesi var (yüzey aktifler Ek-6'da genelde yok).

Birçok satırın CAS/EC/ad hücresi boş çünkü bir önceki satırın devamı (aynı madde, farklı EO derecesi veya derişim). Okuyucu bunları aynı ailenin önceki dolu satırından taşır; bu satırlar `inherited_identity` ile işaretlenir (518 satır).

## Okuma kuralları

- Değerler hücredeki haliyle ham saklanır; sayısal kısım ayrıca min/maks olarak, **işaretiyle birlikte** (`>`, `≥`, `<`, `≤`) tutulur. Aralıklar aralık kalır, ortalama alınmaz.
- H ifadeleri kendi sütunundaki hücreden olduğu gibi kopyalanır. Hücre metninden kod ayıklanmaz; yapılandırılmış sınıflandırma satırları KDU incelemesinden sonra girilir (kural 3).
- CLP ve UN-GHS ayrı profil olur. Türkiye hesabı yalnızca CLP profilini kullanır (UN-GHS profili `classification_system = un_ghs`, hesaba girmez).
- CAS hücreleri: tek numara → `cas`; birden çok numara → liste, tek CAS yazılmaz (42 satır); parantez içindekiler eski/alternatif numara olarak ayrı tutulur; kontrol hanesi tutmayanlar işaretlenir; "not yet assigned", "--" gibi değerler CAS yok sayılır (60 satırda geçerli CAS yok).
- "NC" (CESIO'nun "sınıflandırılmaz" notu) ve "No Recommendation" ham metin olarak saklanır. "Öneri yok" tehlike yok demek değildir (kural 5); "No Recommendation" olan satırlar eksik veri sayılır.
- UN-GHS sütununda "pending" yazan 44 satır var; bunlar "UN-GHS beklemede" olarak işaretlenir.

## Veritabanına eşleştirme (onaylanırsa)

- Her satır için iki `classification_profiles` kaydı: CLP ve UN-GHS. `source_type = industry_guidance`, `regulation = "CESIO Nov 2025"`, `source_reference = "CESIO 2025, <sayfa>, satır <n>"`, `verification_status = pending`, `data_license = unverified`, `warnings = ["CESIO 2025 ED, PBT/vPvB ve PMT/vPvM değerlendirmesi içermez"]`.
- Madde kimliği: CAS Ek-6'daki bir maddeyle eşleşirse o madde kullanılır, yoksa yalnızca kimlik bilgisiyle (CAS, EC, ad) yeni `substances` kaydı açılır. CAS'ı olmayan veya birden çok CAS'lı satırlar için kimlik `list_no` benzeri bir anahtar gerektirir: bunlar için önce karar lazım (aşağıda).
- Sınıflandırma satırları (sınıf/kategori/H kodu) bu adımda yazılmaz; ham metin `source_snapshot` içinde durur.
- Lisansı belirsiz olduğundan, yazılan profiller satır düzeyi güvenlikle yalnızca platform yöneticisine görünür (Adım 1'deki kural). Ayrı geliştirme ortamı olmadığı için **yazma işlemi şimdilik yapılmadı**.

## 15 satırlık doğrulama örneği

PDF dosyası verilmediği için sayfa numarası yerine Excel sayfa adı ve satırı yazıldı. Aynı satırları PDF'te karşılaştırmak için PDF'i bana ver.

| # | Sayfa / satır | Aile | CAS | EO/PO | Derişim | CLP sınıf (CESIO metni) | CLP H | UN-GHS sınıf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Anionic surfact., other / 6 | Alpha Olefin Sulfonates | 68439-57-6 | - | 100 | ENV: NC / HH: Eye Dam.1 / Skin Irrit.2 | ENV: NC / HH: H315 / H318 | ENV: Acute 2 / HH: Acute Tox. 5 (oral) / Eye Dam.  |
| 2 | AS / 5 | Alkyl sulphate salts | 142-31-4 | not relevant | 100% | ENV: NC / HH: Skin Irrit. 2 / Eye Dam. 1 / STOT SE 3 | ENV: NC / HH: H315 / H318 / H335 | ENV: NC / HH: Acute Tox. 5 (oral) / Skin Irrit. 2  |
| 3 | AES / 12 | Alkyl ethersulfate salts | 68891-29-2 | <2.5 EO | 100 | ENV: NC / HH: Skin Irrit. 2 / Eye Dam. 1 | ENV: NC / HH: H315 / H318 | ENV: Aqua. Acute 3 / HH: Skin Irrit. 2 / Eye Dam.  |
| 4 | AE / 5 | Alcohol ethoxylates | 27252-75-1 | < 2.5 EO | 100 | ENV: NC / HH: Eye Dam.1 / No recommendation on skin Irrit. | ENV: NC / HH: H318 | ENV: Acute 3 / HH: Eye Dam.1 / No recommendation o |
| 5 | Other surfactants / 6 | Alkanolamides | 68155-07-7 | - | 100 | ENV: Chronic 2 / HH: Skin Irrit. 2 / Eye Dam. 1 | ENV: H411 / HH: H315 / H318 | ENV: Chronic 2 / HH: Skin Irrit. 2 / Eye Dam. 1 |
| 6 | Anionic surfact., other / 11 | Linear alkyl benzene sulphon | 85536-14-7 | - | 100 | ENV: Chronic 3 / HH: Acute Tox. 4 (oral) / Skin Corr. 1C / Eye Dam. 1 | ENV: H412 / HH: H302 / H314 / H318 | ENV: Acute 2 / Chronic 3 / HH: Acute Tox. 4 (oral) |
| 7 | Other surfactants / 18 | Alkyl polyglucosides | 31387-97-0 | - | 100 | ENV: NC / HH: NC | ENV: NC / HH: NC | ENV: NC / HH: NC |
| 8 | Anionic surfact., other / 15 | CaDDBS | 68953-96-8 | - | 100 | ENV: Chronic 2 / HH: Acute Tox. 4 (derm.) / Skin Irrit. 2 / Eye Dam.1 | ENV: H411 / HH: H312 / H315 / H318 | ENV: Acute 3 / Chronic 2 / HH: Acute Tox. 4 (derm. |
| 9 | Other surfactants / 33 | Fatty acid-N-methylglucamide | 1591782-62-5 | - | 100 | ENV: NC / HH: Acute Tox. 4 (oral) / Eye Dam. 1 / Acute Tox. 4 (Inh) | ENV: NC / HH: H302 / H318 / H332 | ENV: NC / HH: Acute Tox. 4 (oral) / Eye Dam. 1 / A |
| 10 | Anionic surfact., other / 21 | Linear alkylbenzenesulphonic | 84961-74-0 | - | 100 | ENV: Chronic 3 / HH: Skin Irrit. 2 / Eye Irrit. 2 | ENV: H412 / HH: H315 / H319 | ENV: Chronic 3 / HH: pending |
| 11 | Other surfactants / 40 | Fatty acid ethoxylates | 68525-91-7 | ≤ 2.5 EO | 100 | ENV: No Recommendation § / HH: NC | ENV: No Recommendation § / HH: NC | ENV: No Recommendation § / HH: Skin Irrit. 3 |
| 12 | Anionic surfact., other / 24 | Branched alkyl benzene sulph | 68608-88-8 | - | 100 | ENV: Acute 1 (M=1) / Chronic 2 / HH: Acute Tox. 4 (oral) / Skin Corr.  | ENV: H400 / H411 / HH: H302 / H314 / H318 | ENV: Acute 1 (M=1) / Chronic 2 / HH: Acute Tox. 4  |
| 13 | Other surfactants / 52 | Fatty acid EO glycerol ester | 68201-46-7 | >1 - <6.5 EO | 100 | ENV: NC / HH: NC | ENV: NC / HH: NC | ENV: Acute 3 / HH: NC |
| 14 | Anionic surfact., other / 32 | Alkylether carboxylic acids  | 68412-55-5 | 7 EO | 100 | ENV: NC / HH: Eye Dam. 1 | ENV: NC / HH: H318 | ENV: No Recommendation § / HH: Skin Irrit. 3 / Eye |
| 15 | Other surfactants / 59 | Sorbitan ethoxylated fatty a | 9005-64-5 | 1- 6.5 EO | 100 | ENV: NC / HH: NC | ENV: NC / HH: NC | ENV: NC / HH: NC |

## Açık noktalar

- TODO(KDU): Lisans: CESIO tablosunun ticari yazılımda yeniden kullanımı için CESIO'nun izni/koşulu belirsiz (dosyadaki uyarı sayfası yalnızca bağlayıcı olmadığını ve sorumluluk kabul edilmediğini söylüyor, yeniden kullanım iznini belirtmiyor).
- TODO(KDU): CESIO "NC" ve "No Recommendation" ifadelerinin hesapta nasıl ele alınacağı (kural 5 gereği "tehlike yok" sayılmıyor).
- TODO: CAS'ı olmayan (60) veya birden çok CAS'lı (42) satırların kimliği (örn. liste no). Aile adı + EC ile mi tanımlanacak?
- TODO: Ayrı geliştirme ortamı, CESIO yazılmadan önce kurulmalı.
- Eksik girdi: CESIO PDF dosyası (sayfa numaralı doğrulama için).

## CLAUDE.md denetimi

| Kural | Durum |
| --- | --- |
| 1 Sınıflandırma yalnızca motorda | Uyuyor (yalnızca kaynak veri okunuyor) |
| 3 H kodu regex ile toplanmaz | Uyuyor (H hücreleri ham kopyalanır, kod ayıklanmaz) |
| 4 Aralıklar aralık kalır | Uyuyor (min/maks ve işaretler ayrı alanlarda) |
| 5 Eksik veri ≠ tehlike yok | Uyuyor ("No Recommendation" eksik veri sayılır) |
| 8 SCL/M-faktörü | Kısmen: "Acute 1 (M=1)" gibi M faktörleri ham metinde duruyor, yapılandırılmadı |
| 9 Gerekçe izi | Kapsam dışı (kaynak referansı satır düzeyinde saklanacak) |
| Diğerleri (2, 6, 7, 10, 11, 12) | Kapsam dışı |

## Varsayımlar ve kaynakları

1. Her sayfadaki sütun konumları aynı: başlık satırlarından (1.–3. satırlar) doğrulandı.
2. Boş CAS/EC/ad hücresi "önceki satırın devamı": dosya düzenine dayanan çıkarım, bir kısmı bunun tersi olabilir (örnek satırlarla kontrol edilmeli).
