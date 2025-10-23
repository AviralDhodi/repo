// stylelint.config.mjs
import path from "path";

// stylelint.rules.json
var stylelint_rules_default = {
  "slds/enforce-component-hook-naming-convention": [
    true,
    {
      severity: "error"
    }
  ],
  "slds/enforce-sds-to-slds-hooks": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-deprecated-slds-classes": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-hardcoded-values-slds2": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-slds-class-overrides": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-slds-namespace-for-custom-hooks": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-slds-private-var": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-slds-var-without-fallback": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-sldshook-fallback-for-lwctoken": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/no-unsupported-hooks-slds2": [
    true,
    {
      severity: "warning"
    }
  ],
  "slds/reduce-annotations": [
    true,
    {
      severity: "warning"
    }
  ]
};

// stylelint.config.mjs
async function getPlugin() {
  try {
    return await import("@salesforce-ux/stylelint-plugin-slds/build/index.js");
  } catch (err) {
    try {
      const nodeExecutablePath = process.env._;
      if (nodeExecutablePath && nodeExecutablePath.endsWith("slds-linter")) {
        const nodeModulesPath = path.join(nodeExecutablePath, "../..");
        const cliPath = path.join(nodeModulesPath, "@salesforce-ux", "stylelint-plugin-slds", "build", "index.js");
        return await import(`file://${cliPath}`);
      } else {
        throw new Error("process.env._ does not point to slds-linter executable");
      }
    } catch (err2) {
      console.error("Error loading sldsPlugin:", err2);
      process.exit(1);
    }
  }
}
var sldsPlugin = await getPlugin();
var stylelint_config_default = {
  plugins: [sldsPlugin],
  rules: {},
  overrides: [
    {
      files: ["**/*.css", "**/*.scss"],
      customSyntax: "postcss",
      rules: stylelint_rules_default
    }
  ]
};
export {
  stylelint_config_default as default
};
