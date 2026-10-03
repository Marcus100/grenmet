import { render } from "react-email";
import { NotificationEmail, type NotificationEmailProps } from "./notification";
import {
  ResetPasswordEmail,
  type ResetPasswordEmailProps,
} from "./reset-password";
import { WelcomeEmail, type WelcomeEmailProps } from "./welcome";

export type TemplateName = "notification" | "reset-password" | "welcome";

export interface RenderResult {
  html: string;
  subject: string;
}

export async function renderTemplate(
  template: TemplateName,
  props: Record<string, unknown>
): Promise<RenderResult> {
  switch (template) {
    case "notification": {
      const p = props as unknown as NotificationEmailProps;
      return {
        html: await render(NotificationEmail(p)),
        subject: p.title,
      };
    }
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
