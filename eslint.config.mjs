import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts', '**/*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Modul NestJS adalah kelas kosong ber-decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Pola Drizzle `const [row] = await insert(...).returning()` selalu menghasilkan baris;
      // dengan noUncheckedIndexedAccess, `row!` adalah cara paling jelas menyatakannya.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
