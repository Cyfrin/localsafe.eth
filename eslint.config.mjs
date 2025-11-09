import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".cache-synpress/**",
    ],
  },
  {
    rules: {
      // Allow `any` types when working with external SDKs
      "@typescript-eslint/no-explicit-any": "off",

      // React unescaped entities warning (apostrophes, quotes in JSX)
      "react/no-unescaped-entities": "warn",

      // Next.js image - turn off since we're using regular img tags intentionally
      "@next/next/no-img-element": "off",

      // React hooks warnings instead of errors (still important but not blocking)
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default eslintConfig;
