import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MAX_FILE_LINES = 300;
const MAX_FUNCTION_LINES = 50;

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage', '**/node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines': [
        'error',
        { max: MAX_FILE_LINES, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['apps/api/**', 'packages/**', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  {
    // Plain JavaScript has no types to check against.
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // A describe() block is one function that holds a whole suite, and a
    // migration's up() is one function that holds a whole schema.
    files: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'apps/api/test/**/*.ts',
      'apps/api/src/database/migrations/*.ts',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
  prettier,
);
