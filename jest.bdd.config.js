'use strict'
const { pathsToModuleNameMapper } = require('ts-jest/utils')
const { compilerOptions } = require('./tsconfig')
module.exports = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['./src/**/*.ts'],
  coverageReporters: ['json', 'lcov', 'text'],
  clearMocks: true,
  coverageThreshold: {
    global: {
      statements: 40,
      functions: 40,
      branches: 0,
      lines: 40
    }
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/'
  }),
  reporters: ['jest-junit', 'default']
}
