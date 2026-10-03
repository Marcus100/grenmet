import { pathToFileURL } from "node:url";
import { readCatalogue, validateCatalogue } from "./catalogue.mjs";

export function analyticsStatus(catalogue = readCatalogue()) {
  const failures = validateCatalogue(catalogue);
  if (failures.length) throw new Error(failures.join("; "));
  return catalogue.services
    .filter((service) => service.repository === "Marcus100/grenmet")
    .flatMap((service) =>
      ["staging", "production"].map((environment) => {
        const entry = service.environments[environment];
        const mapping = entry.analytics;
        const approved =
          mapping.status === "continuity-approved" ||
          (mapping.retentionVerified &&
            mapping.accessVerified &&
            ["configured", "delivery-verified"].includes(mapping.status));
        let status = "configured; live delivery unverified";
        if (!service.publicAnalytics) status = "not a public analytics surface";
        else if (!entry.origin)
          status = "exact origin and measurement ID needed";
        else if (!mapping.ga4) status = "measurement ID needed";
        else if (!approved) status = "provider settings verification needed";
        else if (mapping.status === "delivery-verified")
          status = "delivery verified";
        return {
          app: service.id,
          environment,
          origin: entry.origin,
          ga4: mapping.ga4,
          status,
        };
      })
    );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.table(analyticsStatus());
