module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  plugins: [
    'cucumber',
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'standard',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    // Enforces ES6+ import/export syntax
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript'
  ],
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
    project: './tsconfig.json',
    tsConfigRootDir: './'
  },
  rules: {
    indent: 'off',
    // Temporary on, since we need @ts-ignore until we fix sdk-standard-components
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    // Sometimes openapi generator emits empty interfaces
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-console': 'off',
    quotes: ['error', 'single'],
    'linebreak-style': ['error', 'unix'],
    semi: ['error', 'never'],
    'cucumber/async-then': 2,
    'cucumber/expression-type': 2,
    'cucumber/no-restricted-tags': [2, 'wip', 'broken', 'foo'],
    'cucumber/no-arrow-functions': 2,
    'import/default': 'warn',
    'import/extensions': 'off',
    'max-len': ['warn', { code: 120 }]
  },
  settings: {
    'import/resolver': {
      typescript: {} // this loads <rootdir>/tsconfig.json to eslint
    }
  },
  overrides: [
    {
      // Disable some rules that we abuse in unit tests.
      files: [
        'test /**/*.ts'
      ],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    },
    {
      files: [
        'src/interface/**/*.ts'
      ],
      rules: {
        'no-use-before-define': 'off',
        'max-len': ['warn', { code: 500 }],
        '@typescript-eslint/ban-types': 'off'
      }
    },
    {
      files: [
        '*.js'
      ],
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ]
}
