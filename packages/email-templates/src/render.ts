import { render } from "@react-email/render";
import {
  ResetPasswordEmail,
  type ResetPasswordEmailProps,
} from "./reset-password.js";
import { WelcomeEmail, type WelcomeEmailProps } from "./welcome.js";

export type TemplateName = "reset-password" | "welcome";

export interface RenderResult {
  html: string;
  subject: string;
}

export async function renderTemplate(
  template: TemplateName,
  props: Record<string, unknown>
): Promise<RenderResult> {
  switch (template) {
    case "reset-password": {
      const p = props as unknown as ResetPasswordEmailProps;
      return {
        html: await render(ResetPasswordEmail(p)),
        subject: `${p.projectName} — Reset your password`,
      };
    }
    case "welcome": {
      const p = props as unknown as WelcomeEmailProps;
      return {
        html: await render(WelcomeEmail(p)),
        subject: `Welcome to ${p.projectName}`,
      };
    }
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unknown email template: ${_exhaustive}`);
    }
  }
}
