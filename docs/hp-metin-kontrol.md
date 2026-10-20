# H/P ifade metinleri: KDU kontrol notu

Tablo: `apps/web/src/lib/sds/phrases.json` (TR ve EN). Otomatik testler (`phrases.test.ts`) şunu garanti eder:
TR ve EN aynı kodlara sahip, hiçbir metin boş değil, motorun üretebileceği her H/P kodunun metni tabloda var.
Testler metnin resmî metinle bire bir aynı olduğunu **doğrulayamaz**; bunun için KDU kontrolü gerekir.

TODO(KDU): aşağıdakileri resmî metinle (SEA Ek-3 / CLP Ek-IV) karşılaştırın.

1. P412: TR "60 °C/140 °F", EN "50 °C/122 °F". İkisi çelişiyor; resmî değer 50 °C/122 °F görünüyor, TR doğrulanmalı.
2. P302+P350 TR metni P302+P352 ile aynı ("Bol su ve sabun ile yıkayın"); EN'de ayrı ("Gently wash"). TR düzeltilmeli.
3. P332+P317, P337+P317, P318, P319: metinler P313 ile aynı veya çok yakın; resmî (2023 sonrası) ifadeyle karşılaştırın.
4. Bu adımda eklenen ve KDU onayı bekleyen metinler: P308+P311, P361+P364, P403+P235 (motor bu kodları üretiyordu ama tabloda metinleri yoktu).
5. EUH tablosunda yalnızca EUH208 var. Motor başka EUH ifadesi üretmiyor; üretmeye başlarsa test uyarmaz, eklenmeli.
