import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extract-supplier-sds',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
