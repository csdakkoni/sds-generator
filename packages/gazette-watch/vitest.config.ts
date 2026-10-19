import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gazette-watch',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
