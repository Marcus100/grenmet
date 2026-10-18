import { render } from "react-email";
import { NotificationEmail, type NotificationEmailProps } from "./notification";
import {
  OrganisationInvitationEmail,
  type OrganisationInvitationEmailProps,
} from "./organisation-invitation";
import {
  ResetPasswordEmail,
  type ResetPasswordEmailProps,
} from "./reset-password";
import {
  SubscriptionConfirmEmail,
  type SubscriptionConfirmEmailProps,
} from "./subscription-confirm";
import { WelcomeEmail, type WelcomeEmailProps } from "./welcome";

export type TemplateName =
  | "notification"
  | "organisation-invitation"
  | "reset-password"
  | "subscription-confirm"
  | "welcome";

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
    case "organisation-invitation": {
      const p = props as unknown as OrganisationInvitationEmailProps;
      if (!(p.acceptLink && p.organisationName && p.inviterName)) {
        throw new Error(
          "organisation-invitation requires acceptLink, organisationName and inviterName"
        );
      }
      return {
        html: await render(OrganisationInvitationEmail(p)),
        subject: `You are invited to join ${p.organisationName}`,
      };
    }
    case "reset-password": {
      const p = props as unknown as ResetPasswordEmailProps;
      return {
        html: await render(ResetPasswordEmail(p)),
        subject: `${p.projectName} — Reset your password`,
      };
    }
    case "subscription-confirm": {
      const p = props as unknown as SubscriptionConfirmEmailProps;
      if (!(p.confirmLink && p.unsubscribeLink && p.listName)) {
        throw new Error("subscription-confirm requires its links and listName");
      }
      return {
        html: await render(SubscriptionConfirmEmail(p)),
        subject: `Confirm your subscription to ${p.listName}`,
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
