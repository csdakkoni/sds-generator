import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'classification-engine',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
