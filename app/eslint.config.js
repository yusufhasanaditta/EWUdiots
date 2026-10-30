// Lint: catches real bugs (undefined names, unreachable code, unused imports) across the app, the admin panel,
// the Vercel functions and the scripts. Style is left to the existing code; npm run lint.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", ".vercel/**", ".shots/**", "android/**", "ios/**", "public/**", "node_modules/**", "src/portal-scrape.js"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser, __APP_VERSION__: "readonly" } },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off", // regexes in the parser are written for readability
      "no-cond-assign": ["error", "except-parens"]
    }
  },
  {
    files: ["api/**/*.js", "scripts/**/*.mjs", "tests/**/*.js", "*.config.js", "vite.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: { "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }], "no-empty": ["error", { allowEmptyCatch: true }], "no-useless-escape": "off" }
  }
];
