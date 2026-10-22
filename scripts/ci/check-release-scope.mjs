import { appendFileSync, readFileSync } from "node:fs";
import {
  appServices,
  dataServices,
  migrationServices,
  releaseScope,
  routedServices,
  validateAdminHosts,
  validateComposeScope,
  validateReleaseConfiguration,
} from "./release-scope.mjs";

// `--print <role>` lets delivery scripts start exactly the registered services.
const printIndex = process.argv.indexOf("--print");
if (printIndex !== -1) {
  const roles = {
    app: appServices,
    data: dataServices,
    migration: migrationServices,
    routed: routedServices,
  };
  const services = roles[process.argv[printIndex + 1]];
  if (!services) {
    console.error(
      "Usage: check-release-scope.mjs --print app|data|migration|routed"
    );
    process.exit(2);
  }
  console.log(services.join(" "));
  process.exit(0);
}

validateReleaseConfiguration(process.env);
if (process.argv.includes("--compose")) {
  const model = JSON.parse(readFileSync(0, "utf8"));
  validateComposeScope(model);
  validateAdminHosts(model);
}
const report = `Release images: FastAPI, ${releaseScope.web.map((image) => image.image).join(", ")}. Deferred services excluded.\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
