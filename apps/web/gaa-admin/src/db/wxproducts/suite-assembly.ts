/**
 * Builds the daily product suite that a day's forecasts belong to.
 *
 * The suite is created on first save of the day rather than by an operator: a
 * forgotten setup step would block a forecaster at the moment they are trying
 * to publish.
 */

import {
  GMS_AGENCY,
  GMS_BEST_PRACTICE,
  GMS_GEOGRAPHY,
  GMS_PRODUCT_CATALOG,
  GMS_SCHEMA_FAMILY,
  GMS_SCHEMA_VERSION,
  GMS_SHARED_ELEMENTS,
} from "@/db/wxproducts/agency";
import type { Suite } from "@/db/wxproducts/schema/suite-types";

/** Products are stored in their own tables; the suite records the day itself. */
export function buildDailySuite(
  suiteId: string,
  issuedAt: Date,
  nextUpdateAt: Date
): Suite {
  const issuedIso = issuedAt.toISOString();
  return {
    catalog: {
      product_types_supported: GMS_PRODUCT_CATALOG,
      shared_elements_standard: GMS_SHARED_ELEMENTS,
    },
    products: [],
    suite_metadata: {
      best_practice_flags: GMS_BEST_PRACTICE,
      geography: GMS_GEOGRAPHY,
      issuing_agency: GMS_AGENCY,
      schema_family: GMS_SCHEMA_FAMILY,
      schema_version: GMS_SCHEMA_VERSION,
      suite_id: suiteId,
      suite_issue_datetime_local: issuedIso,
      suite_issue_datetime_utc: issuedIso,
      suite_type: "daily_product_suite",
      update_policy: {
        next_update_time_local: nextUpdateAt.toISOString(),
        next_update_time_utc: nextUpdateAt.toISOString(),
        notes: null,
      },
    },
  };
}
