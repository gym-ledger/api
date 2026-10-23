import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["**/dist/**", "**/node_modules/**", "load-tester/runs/**"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            // Prefixing with _ marks an argument as deliberately unused (Express handlers, etc.).
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
            // `let { a, b } = …` where only b is reassigned stays a let.
            "prefer-const": ["error", { destructuring: "all" }],
        },
    },
    {
        // The load tester's dashboard: a plain script the browser loads.
        files: ["load-tester/ui/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: globals.browser,
        },
    },
    {
        // pm2's ecosystem file has to be CommonJS.
        files: ["**/*.cjs"],
        languageOptions: {
            sourceType: "commonjs",
            globals: globals.node,
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
);
