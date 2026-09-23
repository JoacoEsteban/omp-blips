// @ts-check
import prettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import { fixupConfigRules } from '@eslint/compat'
import eslint from '@eslint/js'

const TYPESCRIPT_FILES = ['src/**/*.ts', 'scripts/**/*.ts']

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...fixupConfigRules(jest.configs['flat/recommended']),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    settings: {
      jest: {
        version: 29
      }
    },
    rules: {
      'no-restricted-syntax': ['error', 'ConditionalExpression']
    }
  },
  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json']
      }
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'never'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['interface'],
          format: ['PascalCase']
        },
        {
          selector: ['typeAlias'],
          format: ['PascalCase']
        },
        {
          selector: 'enum',
          format: ['PascalCase']
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase']
        },
        {
          selector: 'variable',
          types: ['function'],
          format: ['camelCase', 'PascalCase']
        },
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          types: ['array', 'string', 'number', 'boolean'],
          format: ['UPPER_CASE', 'PascalCase']
        }
      ]
    }
  },
  {
    // Scripts are top-level procedures, so module-scope bindings are locals,
    // not exported constants.
    files: ['scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['interface', 'typeAlias', 'enum'],
          format: ['PascalCase']
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase']
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE']
        }
      ]
    }
  },
  prettier,
  {
    files: TYPESCRIPT_FILES,
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error'
    }
  }
)
