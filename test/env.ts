process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://solace:solace@localhost:5432/solace_test';
process.env.MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.EMAIL_HASH_PEPPER = 'test-pepper';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.THROTTLE_DISABLED = 'true';
