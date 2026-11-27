// What a business says about itself, written in studio Settings: plain text, at
// most 1000 characters, with its line breaks kept. The rule is the booking
// policy's rule (the API normalises both with `normalise_policy`), so the count
// here matches the one the API enforces.

import { cleanPolicy, policyLength } from "@/lib/booking-policy-text";

export const ABOUT_MAX = 1000;

/** The text as the API takes it: line endings as \n, trimmed; blank is null. */
export const cleanAbout = cleanPolicy;

/** Characters as people count them: one code point is one character. */
export const aboutLength = policyLength;
