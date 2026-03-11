import { AuthError, type Token } from "./types.js";

type ErrorLike = {
  message?: string;
  detail?: string;
  status?: number;
  response?: {
    status?: number;
    data?: unknown;
  };
};

function isToken(value: unknown): value is Token {
  if (!value || typeof value !== "object") return false;

  const token = value as Partial<Token>;
  return (
    typeof token.access_token === "string" &&
    typeof token.token_type === "string"
  );
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data.trim()) return data;

  if (!data || typeof data !== "object") return fallback;

  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;

  return fallback;
}

export function coerceToken(value: unknown): Token {
  if (isToken(value)) return value;

  throw new AuthError("Login response did not include a valid access token");
}

export function normalizeAuthError(
  error: unknown,
  fallbackMessage: string
): AuthError {
  if (error instanceof AuthError) return error;

  const authError = error as ErrorLike;
  const statusCode = authError.status ?? authError.response?.status;
  const detail = getErrorMessage(authError.response?.data, fallbackMessage);
  const message =
    typeof authError.message === "string" && authError.message.trim()
      ? detail === fallbackMessage
        ? authError.message
        : detail
      : detail;

  return new AuthError(message, statusCode, detail);
}
