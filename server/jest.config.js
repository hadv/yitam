/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Handle ESM modules properly
  extensionsToTreatAsEsm: ['.ts'],
  // Improve test cleanup
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  // Handle dynamic imports
  testTimeout: 10000,
  // Detect open handles to prevent hanging
  detectOpenHandles: true,
  forceExit: true
};