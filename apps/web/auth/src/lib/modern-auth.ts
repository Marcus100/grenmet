import "server-only";
import {
  type EmailConfirm,
  type EmailRequest,
  emailConfirmApiV1AuthModernEmailConfirmPost,
  emailRequestApiV1AuthModernEmailRequestPost,
  type GoogleComplete,
  type GoogleFinish,
  type GoogleStart,
  googleCompleteApiV1AuthModernGoogleCompletePost,
  googleFinishApiV1AuthModernGoogleFinishPost,
  googleStartApiV1AuthModernGoogleStartPost,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";
import { env } from "./env";

export const modernCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

type Transport = NonNullable<
  NonNullable<
    Parameters<typeof googleStartApiV1AuthModernGoogleStartPost>[1]
  >["client"]
>;
const transport: Transport = async <T>(config: {
  url: string;
  method: string;
  data?: unknown;
}) => {
  const authConfig = getAuthConfig();
  const path = config.url.replace(API_PREFIX, "");
  const data = await authApiFetch<T>(authConfig, path, {
    method: config.method,
    body: config.data,
  });
  return { data, status: 200, statusText: "OK" };
};
export const googleStart = (body: GoogleStart) =>
  googleStartApiV1AuthModernGoogleStartPost(body, { client: transport });
export const googleComplete = (body: GoogleComplete) =>
  googleCompleteApiV1AuthModernGoogleCompletePost(body, { client: transport });
export const googleFinish = (body: GoogleFinish) =>
  googleFinishApiV1AuthModernGoogleFinishPost(body, { client: transport });
export const emailRequest = (body: EmailRequest) =>
  emailRequestApiV1AuthModernEmailRequestPost(body, { client: transport });
export const emailConfirm = (body: EmailConfirm) =>
  emailConfirmApiV1AuthModernEmailConfirmPost(body, { client: transport });

const API_PREFIX = /^\/api\/v1/;
