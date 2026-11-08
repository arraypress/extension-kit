import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '**/*.d.ts'] },
  js.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: 'readonly' } },
    rules: { 'no-var': 'error', 'prefer-const': 'error', 'no-unused-vars': 'error' },
  },
];
