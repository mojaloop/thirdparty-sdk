'use strict'
const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig')
module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/integration'],
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,
  collectCoverage: false,
  clearMocks: true,
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/'
  }),
  reporters: ['jest-junit', 'default']
}
