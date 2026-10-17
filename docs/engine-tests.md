# Motor testleri

Sınıflandırma motorunun birim testleri (`npm test` ile çalışır). Her test, uyguladığı CLP/SEA tablosunu adında belirtir. KDU kontrolü için listelendi; test adları koddaki gibi İngilizce.

## acute-toxicity.test.ts

**acute toxicity (CLP Annex I 3.1.3.6, Tables 3.1.1 and 3.1.2)**

- ✓ uses the ATE mixture formula: 50 % of ATE 500 mg/kg gives ATEmix 1000 → Acute Tox. 4 (H302)
- ✓ uses the converted ATE of Table 3.1.2 when no ATE is given (Acute Tox. 3 oral → 100 mg/kg)
- ✓ reaches category 3 at ATEmix ≤ 300 mg/kg
- ✓ corrects the formula when unknown ingredients exceed 10 % (3.1.3.6.2.3)
- ✓ handles each route separately
- ✓ blocks when an inhalation-toxic ingredient has no physical form
- ✓ computes inhalation ATE for vapours (Acute Tox. 3 vapour → 3 mg/l)

## aquatic-aspiration-physical.test.ts

**aquatic environment (CLP Annex I Tables 4.1.1 and 4.1.2)**

- ✓ Chronic 1 with M = 10 at 0.3 %: M × 10 × 0.3 = 30 ≥ 25 → Aquatic Chronic 2 (H411)
- ✓ Chronic 3 ≥ 25 % gives H412 without pictogram or signal word
- ✓ missing M-factor assumes M = 1 and asks for review

**aspiration (CLP Annex I 3.10.3.3.1)**

- ✓ ≥ 10 % and measured viscosity ≤ 20.5 mm²/s gives H304
- ✓ viscosity above 20.5 mm²/s is not classified
- ✓ missing viscosity is undetermined and blocks

**physical hazards from measured data only (CLP Annex I Table 2.6.1)**

- ✓ flash point 23–60 °C gives Flam. Liq. 3 (H226)
- ✓ flash point < 23 °C and boiling point > 35 °C gives Flam. Liq. 2 (H225)
- ✓ flash point < 23 °C without boiling point assumes category 1 and blocks
- ✓ flash point > 60 °C is not classified even with a flammable component
- ✓ a positive metal corrosion test gives H290; a missing test blocks
- ✓ never derives a physical hazard from component percentages

## label-validation.test.ts

**label elements derived from the final classification (SEA/CLP Articles 20, 26, 27)**

- ✓ GHS06 removes GHS07 (Art. 26(1)(b))
- ✓ GHS05 removes GHS07 for irritation but keeps it for skin sensitisation (Art. 26(1)(c))
- ✓ GHS08 for respiratory sensitisation removes GHS07 for skin sensitisation (Art. 26(1)(d))
- ✓ H318 is not repeated next to H314, while Eye Dam. 1 stays in the classification
- ✓ suggests precautionary statements with the categories behind them
- ✓ an unclassified, fully known mixture with measured data can be finalised

**input checks**

- ✓ blocks on hazard classes the engine does not evaluate
- ✓ blocks when the lower bounds add up to more than 100 %
- ✓ flags an incomplete composition
- ✓ rejects an invalid range instead of guessing
- ✓ extreme pH is only an indicator: review warning, no classification of its own
- ✓ records the engine version on every result

## reference-cases.test.ts

**KDU reference cases**

- ✓ every case file is complete

## required-cases.test.ts

**required cases**

- ✓ Eye Dam. 1 at 10–20 % with pH 7 gives H318, GHS05, DANGER; pH does not change it (CLP Table 3.3.3)
- ✓ STOT RE 1 component at ≥ 10 % gives H372 and DANGER (CLP Table 3.9.4)
- ✓ CMIT/MIT 0.002 % with SCL Skin Sens. 1A ≥ 0.0015 % gives H317 (CLP Table 3.4.5, SCL)
- ✓ NaOH 2.5 % with SCL Skin Corr. 1B 2–5 % gives H314 (CLP Table 3.2.3, SCL)
- ✓ Aquatic Acute 1 component, M = 100, at 0.3 % triggers aquatic classification (CLP Table 4.1.1)
- ✓ flammable component without a measured flash point: warning, no H22x
- ✓ missing ATE data gives a warning, not a "no hazard" result (CLP Annex I 3.1.3.6)

## sensitisation-cmr-stot.test.ts

**sensitisation (CLP Annex I Tables 3.4.5 and 3.4.6)**

- ✓ Skin Sens. 1 ≥ 1 % gives H317
- ✓ Skin Sens. 1 at 0.5 % is not classified but needs EUH208 (≥ 0.1 %)
- ✓ EUH208 with an SCL starts at one tenth of the SCL
- ✓ Resp. Sens. 1 ≥ 1 % gives H334 with GHS08 and DANGER

**CMR (CLP Annex I Tables 3.5.2, 3.6.2, 3.7.2)**

- ✓ Carc. 1B ≥ 0.1 % gives H350
- ✓ Carc. 2 below 1 % is not classified
- ✓ keeps the component hazard statement variant (Repr. 1B H360FD ≥ 0.3 %)
- ✓ Muta. 2 ≥ 1 % gives H341 and WARNING

**STOT (CLP Annex I Tables 3.8.3 and 3.9.4)**

- ✓ STOT SE 1 between 1 % and 10 % gives STOT SE 2 (H371)
- ✓ STOT RE 2 ≥ 10 % gives H373
- ✓ STOT SE 3 adds up per effect against 20 % (H335 and H336 kept apart)

## skin-eye.test.ts

**skin corrosion/irritation (CLP Annex I Table 3.2.3)**

- ✓ Skin Corr. 1A + 1B ≥ 5 % but 1A < 5 % gives Skin Corr. 1B
- ✓ Skin Corr. 1A ≥ 5 % gives Skin Corr. 1A
- ✓ a Skin Corr. 1 ingredient without sub-category gives Skin Corr. 1 without sub-category
- ✓ Skin Corr. 1 between 1 % and 5 % gives Skin Irrit. 2
- ✓ (10 × Skin Corr. 1) + Skin Irrit. 2 ≥ 10 % gives Skin Irrit. 2
- ✓ Skin Irrit. 2 below 10 % alone is not classified
- ✓ an SCL lower than the generic limit is used (Σ C / SCL ≥ 1)

**serious eye damage/irritation (CLP Annex I Table 3.3.3)**

- ✓ Eye Dam. 1 between 1 % and 3 % gives Eye Irrit. 2
- ✓ Eye Irrit. 2 ≥ 10 % gives Eye Irrit. 2
- ✓ Skin Corr. 1 ingredients count towards Eye Dam. 1 (≥ 3 %)

**concentration ranges**

- ✓ reports both bounds when they differ and applies the upper bound as a stated assumption
- ✓ never averages a range: 2–4 % is not treated as 3 %
