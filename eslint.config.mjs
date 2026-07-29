import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import eslintPluginImportX from 'eslint-plugin-import-x'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/_guidelines',
      'propmanager-website/.astro'
    ]
  },
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
      'import-x/no-duplicates': 'warn',
      // AGENTS.md: Use design tokens (theme.palette.*) — no raw hex in renderer code.
      // Excludes locale JSON, test files, and theme definition files.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/]',
          message:
            'Use theme.palette.* or design tokens instead of raw hex colors (AGENTS.md: Visual Consistency).'
        },
        {
          selector: 'Property[key.name=/^marginLeft$|^marginRight$|^paddingLeft$|^paddingRight$/]',
          message:
            'Use logical CSS properties (marginInlineStart, paddingInlineEnd) instead of physical direction properties (AGENTS.md: Logical CSS Properties).'
        },
        {
          selector:
            'Property[key.name="style"] > ObjectExpression > Property[key.name=/^left$|^right$|^top$|^bottom$/]',
          message:
            'Use logical CSS properties (insetInlineStart, insetInlineEnd) or MUI sx with start/end instead of physical positioning (AGENTS.md: Logical CSS Properties).'
        }
      ]
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'max-lines': 'off'
    }
  },
  // Exempt theme definition (sanctioned hex location) and test files from hex color rule
  {
    files: ['src/renderer/theme/theme.ts', '**/*.test.ts', '**/*.spec.ts', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Property[key.name=/^marginLeft$|^marginRight$|^paddingLeft$|^paddingRight$/]',
          message:
            'Use logical CSS properties (marginInlineStart, paddingInlineEnd) instead of physical direction properties (AGENTS.md: Logical CSS Properties).'
        },
        {
          selector:
            'Property[key.name="style"] > ObjectExpression > Property[key.name=/^left$|^right$|^top$|^bottom$/]',
          message:
            'Use logical CSS properties (insetInlineStart, insetInlineEnd) or MUI sx with start/end instead of physical positioning (AGENTS.md: Logical CSS Properties).'
        }
      ]
    }
  },
  eslintConfigPrettier
)
