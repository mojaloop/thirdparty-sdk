import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from "globals";
import jest from 'eslint-plugin-jest';

export default [
    {
        files: ['**/*.ts', '**/*.tsx'], // Target TypeScript files
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            globals: {
                ...globals.node,
                ...globals.jest,
                structuredClone: 'readonly',
            }
        },
        plugins: {
            '@typescript-eslint': ts,
            jest,
        },
        rules: {
            indent: ["error", 2, {
                SwitchCase: 1,
            }],
    
            "linebreak-style": [2, "unix"],
            quotes: [2, "single", { "avoidEscape": true }],
            "no-console": 2,
            "no-prototype-builtins": "off",
        },
        ignores: ["node_modules/**/*.js", ".circleci/*", "*.d.ts", "eslint.config.mjs"]
    },
]