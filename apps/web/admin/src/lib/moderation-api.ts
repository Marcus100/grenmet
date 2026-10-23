import "server-only";

import {
  verificationCaseDetailSchema,
  verificationCaseListSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import {
  MODERATION_PAGE_SIZE,
  type ModerationStatus,
} from "@/lib/moderation-form";

// Organiser verification moderation (apps/api/fastapi/src/events/moderation_router.py).
// Reads: moderators and superusers. Decisions: MFA superusers only; FastAPI
// re-checks both and owns every state rule.

export function listVerificationCases(
  accessToken: string,
  status: ModerationStatus,
  page: number
) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    size: String(MODERATION_PAGE_SIZE),
  });
  return authApiFetch(
    getAuthConfig(),
    `/admin/moderation/organisers?${params}`,
    verificationCaseListSchema,
    { accessToken }
  );
}

export function getVerificationCase(
  accessToken: string,
  organisationId: string
) {
  return authApiFetch(
    getAuthConfig(),
    `/admin/moderation/organisers/${encodeURIComponent(organisationId)}`,
    verificationCaseDetailSchema,
    { accessToken }
  );
}

export function decideVerificationCase(
  accessToken: string,
  organisationId: string,
  decision: "approve" | "reject",
  reason: string | undefined
) {
  return authApiFetch(
    getAuthConfig(),
    `/admin/moderation/organisers/${encodeURIComponent(organisationId)}/${decision}`,
    verificationCaseDetailSchema,
    { accessToken, method: "POST", body: reason ? { reason } : {} }
  );
}
