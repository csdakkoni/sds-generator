import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'library-schema',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
