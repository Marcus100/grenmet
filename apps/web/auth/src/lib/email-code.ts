/**
 * Seconds before "Send a new code" is offered. The API sends nothing for a
 * mailbox inside its one-code-per-minute cooldown (`email_code_cooldown` in
 * apps/api/fastapi/src/auth/lockout.py, 60 seconds) and its reply carries no
 * retry time, so this mirrors that window. Keep the two in step.
 */
export const EMAIL_CODE_RESEND_SECONDS = 60;
