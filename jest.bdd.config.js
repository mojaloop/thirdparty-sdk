'use strict'

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
      statements: 75,
      functions: 75,
      branches: 0,
      lines: 75
    }
  },
  reporters: ['jest-junit', 'default']
}
