import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The engine is shared with the future ERP: it must stay free of UI, database and network code.
    files: ['packages/classification-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', '@react-pdf/*'],
              message: 'Engine must not depend on UI.',
            },
            { group: ['@supabase/*'], message: 'Engine must not depend on the database.' },
            { group: ['@sds/web', 'apps/*'], message: 'Engine must not import the app.' },
          ],
        },
      ],
    },
  },
);
