/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^uuid$": "<rootDir>/__mocks__/uuid.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: [
    "**/lib/__tests__/**/*.test.ts",
    "**/__tests__/integration/**/*.test.ts",
  ],
  testTimeout: 30000,
};

module.exports = config;
