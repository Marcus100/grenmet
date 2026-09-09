import { appendFileSync, readFileSync } from "node:fs";
import {
  releaseScope,
  validateComposeScope,
  validateReleaseConfiguration,
} from "./release-scope.mjs";

validateReleaseConfiguration(process.env);
if (process.argv.includes("--compose"))
  validateComposeScope(JSON.parse(readFileSync(0, "utf8")));
const report = `Release images: FastAPI, ${releaseScope.web.map((image) => image.image).join(", ")}. Deferred services excluded.\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
