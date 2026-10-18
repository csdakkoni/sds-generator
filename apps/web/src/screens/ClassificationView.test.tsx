import { classifyMixture } from '@sds/classification-engine';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassificationView } from './ClassificationView';

describe('ClassificationView', () => {
  it('shows the engine result with its reason and blocks finalising on a recipe gap', () => {
    const result = classifyMixture({
      components: [
        {
          id: 'a',
          name: 'A',
          concentration: { min: 20, max: 20 },
          hazardData: 'classified',
          classifications: [{ category: 'Eye Dam. 1', hCode: 'H318' }],
        },
        {
          id: 'w',
          name: 'Su',
          concentration: { min: 80, max: 80 },
          hazardData: 'not_classified',
          classifications: [],
        },
      ],
      measurements: { physicalState: 'liquid', flashPointC: 101 },
    });
    render(
      <ClassificationView
        result={result}
        notes={[
          { code: 'RECIPE_TOTAL', severity: 'blocking', message: 'Reçete toplamı tutmuyor.' },
        ]}
      />,
    );
    expect(screen.getByText('TEHLİKE')).toBeInTheDocument();
    expect(screen.getByText('H318')).toBeInTheDocument();
    expect(screen.getByText(/henüz kesinleşemez/)).toBeInTheDocument();
    expect(screen.getByText('Reçete toplamı tutmuyor.')).toBeInTheDocument();
  });
});
