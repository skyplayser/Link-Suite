import { configDefaults, defineConfig } from "vitest/config";

// Tests nie auf dem echten Suite-Port 47676: Netztests nehmen LINKSUITE_TEST_PORT (Standard 47683).
export default defineConfig({
  // design/ enthält Bausteine anderer Rollen (eigene Tests dort laufen in deren Projekten), nicht Teil dieser App
  test: { exclude: [...configDefaults.exclude, ".claude/**", "release/**", "design/**"] },
});
