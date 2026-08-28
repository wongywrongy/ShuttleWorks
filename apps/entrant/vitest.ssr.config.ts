import { defineConfig } from 'vitest/config';
import { baseConfig } from './vitest.config';
import { SSR_TEST_FILES } from './vitest.test-files';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [...SSR_TEST_FILES],
  },
});
