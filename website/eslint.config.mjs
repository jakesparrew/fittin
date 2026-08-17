import js from "@eslint/js";
import react from "eslint-plugin-react";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

// Waarom deze linter bestaat (2026-08-06): sess() stond in twee prijsregels van BookingClient
// zonder import. Geen compilatiefout — een ReferenceError die alleen afging in de tak voor leden
// mét tegoed, dus precies bij wie net betaald had. Build, tests en klikken misten hem; een klant
// kon een halve dag niet boeken. no-undef vangt exact die klasse af, vóór de deploy.
//
// Bewust MINIMAAL: dit is een vangnet voor fouten die leden raken, geen stijlpolitie. Elke regel
// hier op "error" hoort een échte productiefout te kunnen zijn — stijlruis wordt genegeerd, en
// een genegeerde linter beschermt niemand (zelfde les als bij de foutlogs-pagina).
export default [
  // scripts/archief/ = eenmalige diagnose-/herstelscripts die ooit één keer gedraaid hebben. Ze
  // verwijzen naar kolommen en functies die intussen kunnen zijn hernoemd. Omdat `eslint .` de
  // prebuild-poort is, zou zo'n verlopen script de deploy tegenhouden voor iets wat niemand nog
  // draait. Bewaard (ze documenteren wat er ooit gebeurde), maar buiten de poort.
  { ignores: ["scripts/archief/**"] },
  {
    files: ["app/**/*.{js,jsx}", "components/**/*.{js,jsx}", "lib/**/*.{js,jsx}", "scripts/**/*.mjs"],
    plugins: { react, "react-hooks": reactHooks, "@next/next": next },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
    rules: {
      // DE regel waar het om draait: elke gebruikte naam moet bestaan.
      "no-undef": "error",
      // Hooks in een if of lus = state die stil corrumpeert. Echte bugvanger, geen stijl.
      "react-hooks/rules-of-hooks": "error",
      // exhaustive-deps bewust UIT als fout: de codebase gebruikt bewuste eenmalige effects;
      // de bestaande disable-comments verwijzen ernaar, dus de regel moet bestaan.
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
      // Zelfde fout voor JSX-componenten: <DoorCodeCard /> zonder import.
      "react/jsx-no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-no-duplicate-props": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-cond-assign": "error",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-compare-neg-zero": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-unsafe-negation": "error",
    },
  },
];
