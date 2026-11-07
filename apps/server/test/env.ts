// 테스트는 개발용 DB와 따로 meets_test DB를 씁니다.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/meets_test';
process.env.CI_HASH_SECRET = 'test-secret';
process.env.IDENTITY_PROVIDER = 'fake';
