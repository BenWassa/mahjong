import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // The #7 interaction prototype is a self-contained package with its own
    // pinned toolchain and its own mirror of this configuration.
    ignores: ["coverage/", "dist/", "node_modules/", "prototype/"],
  },
  {
    files: ["**/*.js"],
    extends: [eslint.configs.recommended],
  },
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { "fixStyle": "inline-type-imports" }
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  }
  ,
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "react", "react/*", "@capacitor/*"],
              message: "The deterministic engine cannot import platform, UI, or native modules."
            }
          ]
        }
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the explicitly seeded engine RNG."
        },
        {
          object: "Date",
          property: "now",
          message: "Wall-clock time cannot affect deterministic engine state."
        }
      ]
    }
  }
);
