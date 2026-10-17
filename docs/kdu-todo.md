# TODO(KDU)

Kodun dayandığı ama KDU onayı gereken mevzuat noktaları. Kodda `TODO(KDU) #n` olarak geçer.

"Uygulanan" sütunu motorun şu an ne yaptığını gösterir. Bunlar seçilmiş varsayımlardır, yasal zorunluluk gibi sunulmaz. "Uygulanmadı" yazanlar için kod yazılmadı; motor bu durumda uyarı verir.

| # | Konu | Uygulanan | Kaynak | Durum |
|---|---|---|---|---|
| 1 | H ve P ifade metinlerinin (TR ve EN) SEA Ek-III resmî metniyle satır satır karşılaştırılması | Metinler henüz taşınmadı (5. adım) | Adım 0 incelemesi | Açık |
| 2 | Genel kesme değerleri (CLP Ek I Tablo 1.1): sınırın altındaki bileşenler toplamaya katılmaz | **Uygulanmadı.** Tüm bileşenler toplamaya katılıyor (daha ihtiyatlı) | CLP Ek I 1.1.2.2 | Açık |
| 3 | Alt kategorisiz Skin Corr. 1 bileşen varsa karışım alt kategorisiz Skin Corr. 1 olur | Böyle bir bileşen varsa 1A/1B/1C ayrımı yapılmıyor | CLP Ek I Tablo 3.2.3 notu | Açık |
| 4 | Cilt için SCL'si olan ama göz için SCL'si olmayan aşındırıcı bileşenin göz sınırı | Göz için genel sınır (%3 / %1) kullanılıyor | CLP Ek I Tablo 3.3.3 | Açık |
| 5 | Toplama yönteminin uygulanmadığı bileşenler (ör. aşırı pH'lı asit/baz) | **Uygulanmadı.** Bileşen için bu işaret henüz yok | CLP Ek I Tablo 3.2.4, 3.3.4 | Açık |
| 6 | Skin Corr. 1 sınıflı karışım Eye Dam. 1 de sayılır | Uygulanıyor (SCL ile %3'ün altında aşındırıcı çıkan karışımlarda fark yaratır) | CLP Ek I 3.3 | Açık |
| 7 | Aşırı pH (≤ 2 veya ≥ 11,5) | Yalnızca inceleme uyarısı; tek başına sınıflandırmaz, hiçbir sınıflandırmayı düşürmez | CLP Ek I 3.2.3.1.2; CLAUDE.md kural 2 | Açık |
| 8 | H314 varken H318'in etikete ayrıca yazılmaması | Uygulanıyor; Eye Dam. 1 sınıflandırmada kalıyor | SEA/CLP Madde 27 | Açık |
| 9 | H410 ile H400'ün etikette birlikte yer alması | İkisi de yazılıyor | SEA/CLP Madde 27 | Açık |
| 10 | Akut toksisite: "ilgili bileşen" için %1 sınırı | **Uygulanmadı.** Tüm bileşenler formüle katılıyor (daha ihtiyatlı). Bilinmeyen pay > %10 ise düzeltilmiş formül uygulanıyor ve uyarı veriliyor | CLP Ek I 3.1.3.3, 3.1.3.6.2.3 | Açık |
| 11 | Farklı solunum formlarındaki (gaz, buhar, toz/sis) bileşenler | Her form ayrı hesaplanıyor, inceleme uyarısı veriliyor | CLP Ek I Tablo 3.1.1 | Açık |
| 12 | EUH208 eşikleri ve karışım o hassaslaştırma için zaten sınıflandırılmışsa EUH208 | Eşikler %0,1 (1A için %0,01) veya SCL / 10; karışım sınıflandırılmışsa EUH208 yazılmıyor | CLP Ek I Tablo 3.4.6, Ek II 2.8 | Açık |
| 13 | CMR ifade varyantlarının birleştirilmesi (ör. H360F + H360D → H360FD) | Bileşenlerin kendi ifadeleri ayrı ayrı alınıyor, birleştirilmiyor | CLP Ek III | Açık |
| 14 | STOT SE 3 için %20 toplama; STOT ifadelerinde hedef organ ve maruz kalma yolu | %20 ile toplanıyor (H335 ve H336 ayrı). Organ/yol metni eklenmiyor | CLP Ek I 3.8.3.4.5, 3.8.2.1, 3.9.2.1 | Açık |
| 15 | M-faktörü girilmemiş Acute 1 / Chronic 1 bileşen | M = 1 varsayılıyor, inceleme uyarısı veriliyor | CLP Ek I Tablo 4.1.3 | Açık |
| 16 | Sucul tehlikesi bilinmeyen bileşenler için etiket ifadesi | Bileşen "bilinmiyor" ise sınıf "belirlenemedi" oluyor; etiket ifadesi henüz üretilmiyor | CLP Ek I 4.1.3.6 | Açık |
| 17 | Yanıcı sıvı: kaynama noktası yokken FP < 23 °C; 35–60 °C arası sürekli yanma (L.2) istisnası | Kategori 1 varsayılıyor ve form kesinleşemiyor; L.2 için inceleme uyarısı | CLP Ek I Tablo 2.6.1, 2.6.4 | Açık |
| 18 | P ifadesi önerilerinin SEA'nın yürürlükteki sürümüyle uyumu | CLP Ek I tablolarındaki setler öneri olarak veriliyor; KDU seçer | SEA Ek I | Açık |
| 19 | Bileşim toplamı %100'ün altında | Tanımsız kısım için inceleme uyarısı | CLAUDE.md kural 5 | Açık |
| 20 | Metal aşındırıcılık sonucu girilmemiş karışım | Form kesinleşemiyor (bileşen yüzdesinden hesaplanmıyor) | CLP Ek I 2.16; CLAUDE.md kural 6 | Açık |
