/**
 * Schema barrel. Example data lives in src/data/ — import from there,
 * not from schema files, to avoid pulling large constants into every consumer.
 */

export * from "./bufr";
export * from "./cap";
export * from "./db-helpers";
export * from "./elements";
export * from "./evening";
export * from "./hourly";
export * from "./ibf";
export * from "./iwxxm-primitives";
export * from "./marine";
export * from "./metarSpeci";
export * from "./midday";
export * from "./morning";
export * from "./outlook";
export * from "./primitives";
export * from "./product-metadata";
export * from "./relations";
export * from "./suite-types";
export * from "./synop";
export * from "./taf";
export * from "./zod-primitives";

// Suite example: import { gmsDailySuiteExample } from "@/data/gms-suite.example";
