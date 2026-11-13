// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**', 'apps/web/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    // Boundary rule: modules never reach into apps or into each other's internals.
    // They talk to the platform through @hrms/module-sdk and @hrms/platform only.
    files: ['modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@hrms/app-*', '**/apps/**'], message: 'Modules must not import apps.' },
            {
              group: ['@hrms/module-*', '**/modules/**'],
              message: 'Modules must not import other modules. Share code through packages/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', '**/*.test.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
