# Mevzuat izleme (Adım 5)

## Ne yapar
- `watch-gazette` (Edge Function) her sabah Resmî Gazete günlük indeksini (`regulatory_sources.url_template`) açar; bugün ve dünü tarar. Anahtar kelimeler: "Maddelerin ve Karışımların Sınıflandırılması", KKDİK, "Güvenlik Bilgi Formu", SEA (tam kelime, Türkçe büyük/küçük harf ve aksan duyarsız).
- Her bulgu `regulatory_change_events` kaydı ve platform düzeyinde bir `kdu_review_queue` (regulation_change) öğesi olur. Aynı bağlantı iki kez yazılmaz.
- Bulgu e-postası: `RESEND_API_KEY` ve `NOTIFY_FROM` tanımlıysa platform yöneticisine gider (şu an tanımlı değil).
- Yönetim ekranında "Mevzuat izleme": bulgular, son kontrol durumu, "İnceleniyor / İlgisiz / Uygulandı" düğmeleri, "şimdi kontrol et".
- `packages/gazette-watch/src/impact.ts`: etki analizi. Her ürünü eski ve yeni sürümle (enjekte edilen sınıflandırıcı) karşılaştırır; değişenler için firmanın KDU listesine `draft_revision` öğesi hazırlar. Saf ve testli; hiçbir şey yazmaz.

## Bilerek yapılmayanlar / bekleyenler
- Etki analizinin gerçek sınıflandırıcıya bağlanması: sürümlü veri (regulation_versions'a bağlı Ek-6 profilleri) henüz yazılmadı, bu yüzden uç fonksiyon yok.
- Günlük zamanlama: `supabase/schedules/watch-gazette.sql` hazır, ancak pg_cron/pg_net kurulumu otomatik izin sınıflandırıcısı tarafından engellendi; erdem SQL editöründe bir kez çalıştırmalı.
- Canlı sayfa yapısı doğrulanmadı: konteynerden resmigazete.gov.tr erişilemiyor (proxy 403). İlk gerçek çalıştırma sonucu Yönetim ekranındaki "son kontrol" satırında görünür; sayfa düzeni farklıysa tarayıcı tüm metin içinde arama yapar (yedek yol).

## Kural denetimi (CLAUDE.md)
| Kural | Durum |
|---|---|
| 1 Sınıflandırma yalnızca motorda | Uyuyor: etki modülü sınıflandırıcıyı dışarıdan alır |
| 2–9 Hesap kuralları | Kapsam dışı (hesap yok) |
| 10 Revizyon yalnızca içerik değişince | Uyuyor: yalnızca değişen ürünler için taslak önerilir |
| 11 KDU onayı | Uyuyor: hiçbir şey yayınlanmaz/uygulanmaz |
| Mevzuat güncelleme süreci | Uyuyor: tespit otomatik, uygulama insan onaylı, eski kayıt silinmez |
| ECHA scraping yasağı | Uyuyor: yalnızca Resmî Gazete indeksi |

## Varsayımlar
- Günlük indeks adresi biçimi `eskiler/YYYY/MM/YYYYMMDD.htm` (erdem'in verdiği şablon).
- Anahtar kelime eşleşmesi yalnızca bağlantı başlığında; bulunamazsa sayfa metninde.

## TODO(KDU)
- Hangi anahtar kelimeler yeterli? (ör. "Biyosidal", "Tehlikeli Maddeler" eklensin mi.)
- Etki analizinde "değişti" sayılacak alanlar: H kodu, uyarı kelimesi, piktogram. Başka alan eklensin mi?
