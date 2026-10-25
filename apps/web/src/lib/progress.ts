import { materialState } from './review';
import type { RawMaterial } from './types';

export interface ProductSummary {
  recipe_lines: { id: string }[];
  sds_documents: { language: string; status: string }[];
}

export type StepState = 'todo' | 'active' | 'done';

export interface Step {
  key: 'upload' | 'approve' | 'recipes' | 'sds';
  state: StepState;
  /** Numbers shown on the step, already worded. */
  summary: string;
}

export interface Progress {
  steps: Step[];
  materials: {
    total: number;
    approved: number;
    waiting: number;
    reading: number;
    questions: number;
  };
  products: { total: number; withRecipe: number; published: number; drafts: number };
}

/**
 * Where a firm stands on the way from supplier SDSs to published SDSs. A step is "done" when
 * nothing in it waits on the firm; the first step that is not done is the one to work on.
 */
export function progress(materials: RawMaterial[], products: ProductSummary[]): Progress {
  const states = materials.map(materialState);
  const count = (...kinds: string[]) => states.filter((s) => kinds.includes(s.kind)).length;
  const m = {
    total: materials.length,
    approved: count('approved', 'by_cas'),
    waiting: count('ready', 'questions', 'failed'),
    reading: count('reading'),
    questions: states.reduce((n, s) => n + (s.kind === 'questions' ? s.open : 0), 0),
  };
  const tr = products.map((p) => p.sds_documents.find((d) => d.language === 'tr'));
  const p = {
    total: products.length,
    withRecipe: products.filter((x) => x.recipe_lines.length > 0).length,
    published: tr.filter((d) => d?.status === 'published').length,
    drafts: tr.filter((d) => d && d.status !== 'published').length,
  };

  const done = [
    m.total > 0 && m.reading === 0,
    m.total > 0 && m.waiting === 0 && m.reading === 0,
    p.total > 0 && p.withRecipe === p.total,
    p.total > 0 && p.published === p.total,
  ];
  const first = done.indexOf(false);
  const state = (i: number): StepState => (done[i] ? 'done' : i === first ? 'active' : 'todo');

  return {
    materials: m,
    products: p,
    steps: [
      {
        key: 'upload',
        state: state(0),
        summary:
          m.total === 0
            ? 'Henüz hammadde yok'
            : `${m.total} hammadde${m.reading ? `, ${m.reading} SDS okunuyor` : ''}`,
      },
      {
        key: 'approve',
        state: state(1),
        summary:
          m.total === 0
            ? 'Önce SDS yükle'
            : m.waiting === 0
              ? `${m.approved} hammaddenin tamamı hazır`
              : `${m.waiting} hammadde bekliyor${m.questions ? `, ${m.questions} soru açık` : ''}`,
      },
      {
        key: 'recipes',
        state: state(2),
        summary:
          p.total === 0
            ? 'Henüz ürün yok'
            : p.withRecipe === p.total
              ? `${p.total} ürünün reçetesi girildi`
              : `${p.total - p.withRecipe} ürünün reçetesi eksik`,
      },
      {
        key: 'sds',
        state: state(3),
        summary:
          p.total === 0
            ? 'Ürün ekleyince başlar'
            : `${p.published} yayında, ${p.drafts} taslak, ${p.total - p.published - p.drafts} başlanmadı`,
      },
    ],
  };
}
