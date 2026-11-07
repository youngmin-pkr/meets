module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/env.ts'],
  // 공통 규칙은 빌드하지 않고 원본을 바로 씁니다.
  moduleNameMapper: { '^@meets/shared$': '<rootDir>/../../packages/shared/src' },
};
