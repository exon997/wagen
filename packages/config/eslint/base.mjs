import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Zajednicka ESLint osnova za sve pakete i aplikacije.
 * Aplikacije je prosiruju vlastitim pravilima (Next.js, Expo).
 */
export default tseslint.config(
  { ignores: ['dist/**', '.next/**', '.expo/**', 'node_modules/**', '*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
