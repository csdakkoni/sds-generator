# Ek-6'daki 902 "boş" kayıt analizi (Adım 2)

Durum: **analiz tamam; veri düzeltmesi yalnızca kurallı olanla sınırlı (aşağıda).** Tahmin yürütülmedi.

## Kısa sonuç

- İlk okumamda 902 madde sınıflandırmasız çıkmıştı. Bugünkü dosyada (PR #16'dan beri) **bu 902 kaydın hepsinin sınıflandırması dolu**; boş kalan yok. Nedeni mevzuat değil, benim ilk okuma hatamdı: EC veya CAS hücresinde "-", köşeli parantez ([1], [2]) ya da birden çok numara olan satırları atlıyordum. Bu yüzden KDU kararı gerektirmez.
- Okumanın doğruluğunu iki yoldan kontrol ettim: (1) örnek kayıtları Resmî Gazete taramasıyla yan yana koydum (sayfa 210 = Gazete sayfa 237: 005-016-00-1 ve 005-017-00-7 birebir aynı; 431. sayfa için aşağıdaki not), (2) eski dosyada dolu olan hiçbir alan değişmedi (4.258 kaydın hiçbirinde eski değer farklı çıkmadı).
- Sayfa numaraları: PDF sayfası dosyadaki sıradır; Resmî Gazete sayfası PDF sayfası + 27'dir (ör. PDF 210 = Gazete 237). Tarama resim olduğu için sayfaları okuma programıyla (OCR) tarayıp liste numarasını arattım; okunamayanlarda CAS numarası ve madde adıyla aradım, bulamadıklarımı "bulunamadı" diye işaretledim.

## Önemli bulgu: Word dosyası, 2013 PDF'inden daha yeni

Veritabanına aldığım metin mevzuat.gov.tr'deki Word dosyasından (7.5.19108-Ek.doc, dosya tarihi Aralık 2020). Yüklediğin PDF ise 11 Aralık 2013 tarihli ve 28848 (Mükerrer) sayılı Resmî Gazete'nin orijinal hali. İkisi aynı metin değil: ör. sulcotrione (606-145-00-1) Word dosyasında var, 2013 PDF'inin 458. Gazete sayfasında yok (606-144'ten sonra 607-001 geliyor). Yani Word dosyası sonradan eklenen maddeleri de içeriyor. Bu yüzden 373 kaydın sayfasını 2013 PDF'inde bulamadım; bir kısmı sonradan eklenmiş olabilir, bir kısmı tarama okuma hatası olabilir (hangisi olduğunu ayırt edemiyorum, tahmin etmiyorum).

## Gruplar (902 kayıt)

Her kayıt, ilk hücre özelliğine göre tek bir gruba girdi.

### 1. Grup girişleri (156 kayıt): birden çok madde tek satırda ([1], [2] işaretli)

Neden boştu: CAS/EC hücresinde birden çok numara ve [1] [2] işaretleri vardı, eski okuma bunu atlıyordu.
Şimdi: numaralar `cas_list` ve `ec_list` olarak saklanıyor, tek bir CAS/EC yazılmıyor (hangi maddeye ait olduğu belirsiz kalmasın diye).

| Liste no | Madde | PDF sayfa | Resmî Gazete sayfa | Yeni okunan sınıflandırma |
| --- | --- | --- | --- | --- |
| 005-017-00-7 | sodium perborate; [1]  sodium sodium peroxometabor | 210 | 237 | Oksit. Katı 2 Akut Tok. 4 BHOT Tek Mrz. 3 Göz Hsr. 1 → H272 H302 H335 H318 |
| 028-051-00-4 | nickel diarsenide; [1]  nickel arsenide [2] | 306 | 333 | Kans. 1A BHOT Tekrar.Mrz. 1 Cilt Hassas. 1 Sucul Akut 1 Sucul Kronik 1 → H350i H372 H317 H400 H410 |
| 603-010-00-9 | 2-methylcyclohexanol, mixed isomers; [1]  cis-2-me | 365 | 392 | Akut Tok. 4 → H332 |
| 607-105-00-6 | 8,9,10-trinorborn-5-ene-2,3-dicarboxylic anhydride | 446 | 473 | Göz Hsr. 1 Solnm. Hassas. 1 Cilt Hassas. 1 → H318 H334 H317 |
| 612-052-00-7 | (S)-sec-butylamine;  (S)-2-aminobutane; [1]  (R)-s | 609 | 636 | Alev.Sıvı 2 Akut Tok. 4 Akut Tok. 4 Cilt Aşnd. 1A Sucul Akut 1 → H225 H332 H302 H314 H400 |

- Kurallı düzeltilebilir: numaralı listelerin kütüphane aramasında kullanılması (veri dosyada hazır). Düzeltme Adım 1'in profil yazımıyla birlikte yapılacak.
- KDU kararı: yok. Not: aynı satırdaki [1]/[2] için farklı özel sınır değerleri varsa metin olduğu gibi saklanıyor.

### 2. Notlu kayıtlar (109 kayıt): "Notlar" sütununda harf var (A, C, J, K, L, M, N, P, U...)

Neden boştu: not hücresi dolu olan satırlarda sütunlar kayıyordu.
Şimdi: sınıflandırma dolu ve **not harfleri artık ham haliyle saklanıyor** (bu PR'da eklendi). Tüm Ek-6'da notlu kayıt: 938. En sık: K U (145), P (142), L (100), A (68), C (57), J M (52), D (48).

| Liste no | Madde | PDF sayfa | Resmî Gazete sayfa | Yeni okunan sınıflandırma |
| --- | --- | --- | --- | --- |
| 007-014-00-6 | salts of hydrazine | 227 | 254 | Kans. 1B Akut Tok. 3 Akut Tok. 3 Akut Tok. 3 Cilt Hassas. 1 Sucul Akut → H350 H331 H311 H301 H317 H400 H410 |
| 034-002-00-8 | selenium compounds with the exception of cadmium s | 314 | 341 | Akut Tok. 3 Akut Tok. 3 BHOT Tekrar.Mrz. 2 Sucul Akut 1 Sucul Kronik 1 → H331 H301 H373 H400 H410 |
| 092-002-00-3 | uranium compounds with the exception of those spec | 334 | 361 | Akut Tok. 2 Akut Tok. 2 BHOT Tekrar.Mrz. 2 Sucul Kronik 2 → H330 H300 H373 H411 |
| 609-026-00-2 | salts and esters of dinoseb, with the exception of | 543 | 570 | Ürm. Sis. Tok. 1B Akut Tok. 3 Akut Tok. 3 Göz Tah. 2 Sucul Akut 1 Sucu → H360Df H311 H301 H319 H400 H410 |
| 613-167-00-5 | reaction mass of: 5-chloro-2-methyl-2H-isothiazol- | 667 | 694 | Akut Tok. 2 Akut Tok. 2 Akut Tok. 3 Cilt Aşnd. 1C Göz Hsr. 1 Cilt Hass → H330 H310 H301 H314 H318 H317 H400 H410 |

- Kurallı düzeltilebilir: not harfinin ham metin olarak taşınması (yapıldı).
- **KDU kararı gerekir:** her notun sınıflandırmayı nasıl etkilediği (özellikle J, K, L, M, N, P, Q, R notları: bazı kanserojenlik/mutajenite sınıflandırması belirli koşullarda uygulanmaz). Not metinleri Ek-6'nın giriş bölümünde yazıyor; hesaba katılmaları için KDU kuralı gerekiyor. Şimdilik motor notları kullanmıyor ve notlu maddeler hesapta uyarı almalı.

### 3. EC veya CAS numarası olmayan kayıtlar (631 kayıt, hücrede "-")

Neden boştu: eski okuma sayı bekliyordu, "-" gelince satırı atlıyordu.
Şimdi: sınıflandırma dolu; numara yoksa boş bırakılıyor ("-" bir değer olarak yazılmıyor).

| Liste no | Madde | PDF sayfa | Resmî Gazete sayfa | Yeni okunan sınıflandırma |
| --- | --- | --- | --- | --- |
| 005-016-00-1 | tetrabutylammonium butyl tris-(4-tert-butylphenyl) | 210 | 237 | Sucul Kronik 4 → H413 |
| 016-091-00-5 | C12-14-tert-alkyl ammonium 1-amino-9,10-dihydro-9, | 278 | 305 | Göz Hsr. 1 Sucul Akut 1 Sucul Kronik 1 → H318 H400 H410 |
| 607-167-00-4 | sodium 3-chloroacrylate | 454 | 481 | Akut Tok. 4 Akut Tok. 4 → H312 H302 |
| 611-050-00-3 | reaction mass of: pentasodium 7-amino-3-[[4-[[4-[[ | 563 | 590 | Göz Hsr. 1 Sucul Kronik 3 → H318 H412 |
| 613-165-00-4 | flupyrsulfuron-methyl-sodium (ISO);  methyl 2-[[(4 | 666 | 693 | Sucul Akut 1 Sucul Kronik 1 → H400 H410 |

- Kurallı düzeltilebilir: kayıt liste numarasıyla tanınıyor (zaten öyle).
- KDU kararı: yok. Bu maddeler CAS ile eşleşmeyecek; karışımdaki bu maddeler için ad/EC ile eşleştirme gerekir.

### 4. EC hücresi tamamen boş (6 kayıt)

Neden boştu: hücre "-" bile değildi, boştu; eski okuma bunu da atlıyordu. Bunlar tipik olarak Word dosyasına sonradan eklenen maddeler.

| Liste no | Madde | PDF sayfa | Resmî Gazete sayfa | Yeni okunan sınıflandırma |
| --- | --- | --- | --- | --- |
| 606-145-00-1 | sulcotrione (ISO); 2-[2-chloro-4-(methylsulfonyl)b | bulunamadı (çevresi 431-431) | - | Ürm.Sis.Tok. 2 BHOT Tekrar Mrz.2 Cilt Hassas 1A Sucul Akut 1 Sucul Kro → H361d H373 H317 H400 H410 |
| 606-146-00-7 | tralkoxydim (ISO); 2-(N- ethoxypropanimidoyl)- 3-h | bulunamadı (çevresi 431-431) | - | Kans. 2 Akut Tok. 4 Sucul Kronik 2 → H351 H302 H411 |
| 607-699-00-7 | bifenthrin (ISO); (2-methylbiphenyl-3-yl)methyl re | bulunamadı (çevresi 530-530) | - | Kans. 2 Akut Tok.3 Akut Tok 2 BHOT Tekrar Mrz.1 Cilt Hassas. 1B Sucul  → H351 H331 H300 H372 H317 H400 H410 |
| 612-287-00-5 | fluazinam (ISO); 3- chloro-N-[3-chloro-2,6- dinitr | bulunamadı (çevresi 643-643) | - | Ürm. Sis.Tok. 2 Akut Tok. 4 Göz Hsr. 1 Cilt Hassas. 1A Sucul Akut 1 Su → H361d H332 H318 H317 H400 H410 |
| 616-210-00-6 | tebufenpyrad (ISO); N-(4-tertbutylbenzyl)-4-chloro | bulunamadı (çevresi 722-723) | - | Akut Tok. 3 Akut Tok.4 BHOT Tekrar. 2 Cilt Hassas 1B Sucul Akut 1 Sucu → H301 H332 H373 H317 H400 H410 |

- Kurallı düzeltilebilir: okuma düzeltildi. KDU kararı: yok.

### 5. Kaynakta eksik kalan 2 kayıt (902'nin dışında, yeni bulgu)

053-003-00-4 (iodoxybenzene) ve 053-004-00-X (calcium iodoxybenzoate): sınıflandırma metni "Pat." (patlayıcı) ama bölüm/kategori ve H kodu hücreleri Word dosyasında boş. Okuma hatası değil, kaynak böyle. Tahmin etmiyorum. **KDU kararı gerekir:** doğru kategori ve H kodu (Resmî Gazete'nin güncel metninden). İkisi de 2013 PDF'inin 053-002 civarındaki sayfalarında (PDF 324–325) bulunmuyor; yani sonradan eklenmiş girişler, 2013 metninden karşılaştırma yapılamıyor.

## Başka kayıp bilgiler (tüm 4.258 kayıt için bakınca bulundu)

1. **Özel sınır değerleri ve M-faktörleri** (son sütun, 454 kayıt) dosyada yoktu. Bu PR'da ham metin olarak eklendi (`scl_m_text`). Kural 8 (SCL, M-faktörü, ATE) için gerekli; yapılandırılmış hale getirmek ayrı iş.
2. **Yıldız (*) işareti** (asgari sınıflandırma anlamında, ör. "Akut Tok. 4 *") 2013 PDF'inde var, Word dosyasında yok. 2013 PDF'inde yaklaşık 600 satırda yıldız görünüyor. Hangi maddelerde olduğunu taramadan güvenle çıkaramıyorum. **KDU kararı gerekir:** yıldızlı kategorilerin motorda nasıl işaretleneceği; Word dosyasında yıldızın neden olmadığı (güncel metin mi, dönüşüm kaybı mı).
3. **Hedef organ bilgisi** (ör. H372 (kan, sinir sistemi)) 27 kayıtta H kodunun yanında yazıyordu; JSON'da yalnızca kod var. Ham sınıflandırma metni saklanmıyor olduğu için bu bilgi kayıp. Ham hücre metnini de saklamak kurallı bir düzeltme; bu PR'a eklemedim, Adım 1'in `source_snapshot` yazımıyla birlikte yapılacak.
4. H kodları, dosyadaki "Zararlılık İfadesi Kodu" sütunundaki hücreden ayrıştırılıyor. Kural 3 "metin taramasıyla toplanmaz" diyor; bu bir tablo sütunu olduğu için yapılandırılmış kaynak sayıyorum ama KDU'nun bunu onaylaması iyi olur.

## Bu PR'da ne değişti

- `scripts/ek6/parse_table3.py`, `build_public_json.py`: iki yeni ham alan (`note`, `scl_m_text`).
- `apps/web/public/ek6/sea-ek6-substances.json`: yeni alanlarla yeniden üretildi. **Eski hiçbir değer değişmedi** (4.258 kayıt karşılaştırıldı). Veritabanına dokunulmadı.
- Tam liste (902 kayıt, grup, sayfa, yeni sınıflandırma): `ek6-analiz/902-kayit-gruplari.csv` (proje dosyalarında).

## CLAUDE.md denetimi

| Kural | Durum | Not |
| --- | --- | --- |
| 1 Sınıflandırma yalnızca motorda | Uyuyor | Yalnızca kaynak veri okundu. |
| 2 pH ile düşürme yok | Kapsam dışı | |
| 3 H kodu regex ile toplanmaz | Kısmen / KDU'ya soruldu | Kodlar sınıflandırma sütunu hücresinden okunuyor (madde 4 yukarıda). |
| 4 Aralıklar aralık kalır | Kapsam dışı | |
| 5 Eksik veri ≠ tehlike yok | Uyuyor | Eksik kaynaklar (2 kayıt) tahmin edilmedi, işaretlendi. |
| 6 Fiziksel tehlike toplanmaz | Kapsam dışı | |
| 7 Türetilen uyarı/piktogram | Kapsam dışı | |
| 8 SCL, M-faktörü, ATE | Kısmen | Ham metin artık saklanıyor, yapılandırma sonra. |
| 9 Gerekçe izi | Kapsam dışı | |
| 10 Doküman/revizyon | Kapsam dışı | |
| 11 KDU onayı | Uyuyor | Hiçbir profil doğrulanmış sayılmadı. |
| 12 Şablon metinler | Kapsam dışı | |

## Varsayımlar ve kaynakları

1. Resmî Gazete sayfası = PDF sayfası + 27. Kaynak: PDF'in 1. sayfasındaki "Sayfa : 28" ve 210. sayfadaki "Sayfa : 237" başlığı.
2. 2013 PDF'inin Ek-6 tablosu ile Word dosyasının farklı sürümler olduğu: kaynak, 606-145-00-1'in 2013 PDF'inde bulunmaması (sayfa 431/Gazete 458).

## TODO(KDU)

- TODO(KDU): Notların (A–U) sınıflandırmaya etkisi (özellikle J, K, L, M, N, P, Q, R).
- TODO(KDU): Yıldızlı (*) asgari sınıflandırmaların işaretlenmesi.
- TODO(KDU): 053-003-00-4 ve 053-004-00-X için kategori ve H kodu.
- TODO(KDU): H kodlarının tablo sütunundan okunması kural 3 ile uyumlu mu?
- TODO(KDU): Veritabanındaki Ek-6 sürümü: Word dosyasının tarihi/sürümü ve yürürlük tarihi (`regulation_versions` kaydı için). Resmî Gazete 11.12.2013 / 28848 (Mükerrer) yalnızca orijinal yayının künyesi; Word dosyası sonraki değişiklikleri içeriyor.
