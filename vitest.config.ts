import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // Force filesystem backend in tests so tool-level tests don't route
      // through Qdrant (which requires a live server and separate data store).
      LOOM_MEMORY_BACKEND: 'filesystem',
    },
  },
});
