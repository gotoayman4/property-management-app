import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import eslintPluginImportX from 'eslint-plugin-import-x'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/_guidelines'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
      'import-x': eslintPluginImportX
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off',
      'react-hooks/incompatible-library': 'off',
      // AGENTS.md: No console.log in production code.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // AGENTS.md: Import hygiene — consistent ordering, no duplicates.
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true }
        }
      ],
      'import-x/no-duplicates': 'warn'
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'max-lines': 'off'
    }
  },
  eslintConfigPrettier
)
