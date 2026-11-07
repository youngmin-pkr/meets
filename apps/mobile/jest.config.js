// 화면과 분리한 규칙(src/signupFlow.ts)만 테스트합니다.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, strict: true, types: ['jest'] } }],
  },
  moduleNameMapper: { '^@meets/shared$': '<rootDir>/../../packages/shared/src' },
};
