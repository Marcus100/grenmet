"use client";

import { useReadHrProfileMeApiV1HrProfileMeGet } from "@grenmet/api-client";
import { useSessionUser } from "@grenmet/auth";
import { format } from "date-fns";
import { useEffect, useRef } from "react";

export interface EditorPrefillContext {
  /** The user's department name, or "" when they have no employment record. */
  department: string;
  /** The signed-in user's full name, or "" when unknown. */
  fullName: string;
  /** Today as an ISO `yyyy-MM-dd` string, matching the date fields/DatePicker. */
  today: string;
}

/**
 * Seed an HR form's fields once, after the session user and HR profile resolve.
 *
 * `apply` receives the resolved context and should write fields via the form's
 * `setFieldValue` — guard each with `getFieldValue` so prefill never overwrites
 * a value the user already typed. Pass `skip` (e.g. when a `?draft=` is being
 * loaded) so prefill doesn't fight the draft loader.
 *
 * Centralizing this keeps the "wait for context, run once, respect drafts"
 * logic in one place instead of duplicating an effect across every editor.
 */
export function useEditorPrefill(
  apply: (ctx: EditorPrefillContext) => void,
  options: { skip?: boolean } = {}
): void {
  const sessionUser = useSessionUser();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const appliedRef = useRef(false);
  // Track the latest apply without making it an effect dependency.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const skip = options.skip ?? false;
  const profileReady = !profileQuery.isFetching;

  useEffect(() => {
    if (skip || appliedRef.current || !profileReady) {
      return;
    }
    applyRef.current({
      fullName: sessionUser.full_name ?? "",
      department: profileQuery.data?.employment?.department?.name ?? "",
      today: format(new Date(), "yyyy-MM-dd"),
    });
    appliedRef.current = true;
  }, [skip, profileReady, profileQuery.data, sessionUser]);
}
