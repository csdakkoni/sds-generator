import type { HazardCategory, MixtureClassification, MixtureMeasurements } from '../types';
import { type Component, emptyOutput, fmt, type RuleOutput } from '../util';

const FLAM_REF = 'CLP Ek I Tablo 2.6.1';
const MET_CORR_REF = 'CLP Ek I 2.16 (UN Test C.1)';

const FLAMMABLE: HazardCategory[] = ['Flam. Liq. 1', 'Flam. Liq. 2', 'Flam. Liq. 3'];

/**
 * Physical hazards come only from data measured on the mixture, never from component
 * percentages (CLAUDE.md rule 6). Missing data blocks finalisation.
 */
export function classifyPhysical(
  components: readonly Component[],
  m: MixtureMeasurements,
): RuleOutput {
  const output = emptyOutput();
  classifyFlammableLiquid(components, m, output);
  classifyMetalCorrosion(components, m, output);
  return output;
}

function classifyFlammableLiquid(
  components: readonly Component[],
  m: MixtureMeasurements,
  output: RuleOutput,
): void {
  if (m.physicalState && m.physicalState !== 'liquid') {
    output.status.flammable_liquid = 'not_classified';
    return;
  }
  const flammableComponents = components.filter((c) =>
    c.known.some((k) => FLAMMABLE.includes(k.category)),
  );
  if (m.flashPointC === undefined) {
    output.status.flammable_liquid = 'undetermined';
    const names = flammableComponents.map((c) => c.name).join(', ');
    output.warnings.push({
      code: 'FLASH_POINT_MISSING',
      severity: 'blocking',
      hazardClass: 'flammable_liquid',
      componentIds: flammableComponents.map((c) => c.id),
      message:
        flammableComponents.length > 0
          ? `Karışım yanıcı bileşen içeriyor (${names}) ama parlama noktası ölçülmemiş. Yanıcılık (H224/H225/H226) bileşen yüzdelerinden hesaplanmaz; ölçüm girilmeden form kesinleşemez.`
          : 'Parlama noktası ölçülmemiş. Yanıcılık bileşen yüzdelerinden hesaplanmaz; ölçüm girilmeden form kesinleşemez.',
    });
    return;
  }

  const fp = m.flashPointC;
  const ibp = m.initialBoilingPointC;
  let category: HazardCategory | null = null;
  let reason = '';
  if (fp < 23) {
    if (ibp === undefined) {
      category = 'Flam. Liq. 1';
      reason = `ölçülen parlama noktası ${fmt(fp)} °C < 23 °C; kaynama başlangıç noktası ölçülmediği için daha ağır kategori 1 varsayıldı (seçilmiş varsayım)`;
      output.warnings.push({
        code: 'BOILING_POINT_MISSING',
        severity: 'blocking',
        hazardClass: 'flammable_liquid',
        message: `Parlama noktası ${fmt(fp)} °C < 23 °C, kaynama başlangıç noktası ölçülmemiş: kategori 1 ile 2 ayrılamıyor. Kategori 1 varsayıldı; ölçüm girilmeden form kesinleşemez (TODO(KDU) #17).`,
      });
    } else if (ibp <= 35) {
      category = 'Flam. Liq. 1';
      reason = `ölçülen parlama noktası ${fmt(fp)} °C < 23 °C ve kaynama başlangıç noktası ${fmt(ibp)} °C ≤ 35 °C`;
    } else {
      category = 'Flam. Liq. 2';
      reason = `ölçülen parlama noktası ${fmt(fp)} °C < 23 °C ve kaynama başlangıç noktası ${fmt(ibp)} °C > 35 °C`;
    }
  } else if (fp <= 60) {
    category = 'Flam. Liq. 3';
    reason = `ölçülen parlama noktası 23 °C ≤ ${fmt(fp)} °C ≤ 60 °C`;
    if (fp > 35) {
      output.warnings.push({
        code: 'FLAM_LIQ_SUSTAINED_COMBUSTION',
        severity: 'review',
        hazardClass: 'flammable_liquid',
        message: `Parlama noktası ${fmt(fp)} °C (35–60 °C): sürekli yanma testi (L.2) olumsuzsa kategori 3 gerekmeyebilir. KDU değerlendirmeli (TODO(KDU) #17).`,
      });
    }
  }

  if (!category) {
    output.status.flammable_liquid = 'not_classified';
    return;
  }
  const hCode = { 'Flam. Liq. 1': 'H224', 'Flam. Liq. 2': 'H225', 'Flam. Liq. 3': 'H226' }[
    category as 'Flam. Liq. 1' | 'Flam. Liq. 2' | 'Flam. Liq. 3'
  ];
  const classification: MixtureClassification = {
    hazardClass: 'flammable_liquid',
    category,
    hCodes: [hCode],
    lowerBoundCategory: category,
    trace: [{ message: `${hCode} (${category}), çünkü ${reason}`, reference: FLAM_REF }],
  };
  output.classifications.push(classification);
  output.status.flammable_liquid = 'classified';
}

function classifyMetalCorrosion(
  components: readonly Component[],
  m: MixtureMeasurements,
  output: RuleOutput,
): void {
  if (m.metalCorrosion === 'negative') {
    output.status.metal_corrosion = 'not_classified';
    return;
  }
  if (m.metalCorrosion === 'positive') {
    output.classifications.push({
      hazardClass: 'metal_corrosion',
      category: 'Met. Corr. 1',
      hCodes: ['H290'],
      lowerBoundCategory: 'Met. Corr. 1',
      trace: [
        {
          message: 'H290 (Met. Corr. 1), çünkü metal aşındırıcılık testi olumlu',
          reference: MET_CORR_REF,
        },
      ],
    });
    output.status.metal_corrosion = 'classified';
    return;
  }
  const corrosive = components.filter((c) => c.known.some((k) => k.category === 'Met. Corr. 1'));
  output.status.metal_corrosion = 'undetermined';
  output.warnings.push({
    code: 'METAL_CORROSION_MISSING',
    severity: 'blocking',
    hazardClass: 'metal_corrosion',
    componentIds: corrosive.map((c) => c.id),
    message:
      corrosive.length > 0
        ? `Karışım metal aşındırıcı bileşen içeriyor (${corrosive.map((c) => c.name).join(', ')}) ama metal aşındırıcılık sonucu girilmemiş. H290 bileşen yüzdelerinden hesaplanmaz; form kesinleşemez (TODO(KDU) #20).`
        : 'Metal aşındırıcılık sonucu girilmemiş; form kesinleşemez (TODO(KDU) #20).',
  });
}
