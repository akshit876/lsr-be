import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      js: pluginJs, // Define plugins as an object with namespace keys
    },
    rules: {
      semi: ["error", "always"],
      // quotes: ['error', 'single'],
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  pluginJs.configs.recommended,
];
