import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Mirrors the repository's root configuration so the throwaway prototype is
// held to the same standard as the engine it will eventually sit on top of.
export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/"],
  },
  {
    files: ["**/*.js"],
    extends: [eslint.configs.recommended],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
);
