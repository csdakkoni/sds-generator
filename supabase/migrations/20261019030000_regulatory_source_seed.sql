-- The Resmî Gazete daily index as the first watched source. Keywords are matched as whole words,
-- ignoring Turkish case and accents.
insert into public.regulatory_sources (name, kind, url_template, keywords)
values (
  'Resmî Gazete günlük indeks',
  'gazette_daily_index',
  'https://www.resmigazete.gov.tr/eskiler/{YYYY}/{MM}/{YYYY}{MM}{DD}.htm',
  array['Maddelerin ve Karışımların Sınıflandırılması', 'KKDİK', 'Güvenlik Bilgi Formu', 'SEA']
);
