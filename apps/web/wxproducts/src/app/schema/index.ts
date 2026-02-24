/**
 * Schema barrel. For the example suite data, import from @/app/schema/suite-example
 * to avoid pulling the large constant into every consumer.
 */

export * from "./bufr";
export * from "./cap";
export * from "./elements";
export * from "./evening";
export * from "./ibf";
export * from "./iwxxm-primitives";
export * from "./marine";
export * from "./metarSpeci";
export * from "./midday";
export * from "./morning";
export * from "./outlook";
export * from "./primitives";
export * from "./product-metadata";
export * from "./suite-types";
export * from "./synop";
export * from "./taf";
export * from "./zod-primitives";

// Omit gmsDailySuiteExample from barrel; use: import { gmsDailySuiteExample } from "@/app/schema/suite-example";
