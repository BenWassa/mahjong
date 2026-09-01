import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // android/ is the generated Capacitor native platform (#11): its web
    // assets are a synced copy of dist-capacitor/, and its Java/Gradle files
    // are not JS/TS this config's parsers understand.
    ignores: ["dist/", "dist-capacitor/", "dev-dist/", "node_modules/", "qa-out/", "android/"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        // Node scripts that pass function bodies to page.evaluate, which the
        // browser runs. These identifiers are resolved there, not here.
        document: "readonly",
        window: "readonly",
        getComputedStyle: "readonly",
        navigator: "readonly",
        caches: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
);
