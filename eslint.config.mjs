import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from "globals";

export default [
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: './'
            }
        },
        plugins: {
            '@typescript-eslint': ts,
            'prettier': prettier,
            'import': importPlugin
        },
        rules: {
            ...js.configs.recommended.rules,
            ...ts.configs.recommended.rules,
            ...prettierConfig.rules,
            ...prettier.configs.recommended.rules,
            ...importPlugin.configs.recommended.rules,
            'no-useless-constructor': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-empty-interface': 'warn'
        },
        settings: {
            'import/resolver': {
                typescript: {}
            }
        }
    },
    {
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off'
        }
    },
    {
        files: ['src/interface/**/*.ts'],
        rules: {
            'no-use-before-define': 'off',
            'max-len': ['warn', { code: 600 }],
            '@typescript-eslint/ban-types': 'off',
            '@typescript-eslint/no-empty-interface': 'off'
        }
    },
    {
        files: ['*.js'],
        rules: {
            '@typescript-eslint/no-var-requires': 'off'
        }
    }
];