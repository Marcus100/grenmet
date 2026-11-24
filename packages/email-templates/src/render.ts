import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import { CapAlertEmail, type CapAlertEmailProps } from "./cap-alert";
import { CardEmail } from "./card";
import { cardProps } from "./card-props";
import { NewsletterEmail, type NewsletterEmailProps } from "./newsletter";
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
import {
  SuperuserInvitationEmail,
  type SuperuserInvitationEmailProps,
} from "./superuser-invitation";
import { WelcomeEmail, type WelcomeEmailProps } from "./welcome";

export type TemplateName =
  | "card"
  | "cap-alert"
  | "newsletter"
  | "notification"
  | "organisation-invitation"
  | "reset-password"
  | "subscription-confirm"
  | "superuser-invitation"
  | "welcome";

export interface RenderResult {
  html: string;
  subject: string;
  /** The plain-text part, generated from the same HTML (react-email toPlainText). */
  text: string;
}

interface Built {
  element: ReactElement;
  subject: string;
}

function requireFields(
  template: string,
  props: Record<string, unknown>,
  fields: readonly string[]
): void {
  const missing = fields.filter((field) => !props[field]);
  if (missing.length > 0) {
    throw new Error(`${template} requires ${fields.join(", ")}`);
  }
}

function build(template: TemplateName, props: Record<string, unknown>): Built {
  switch (template) {
    case "card": {
      const p = cardProps(props);
      return { element: CardEmail(p), subject: p.subject };
    }
    case "cap-alert": {
      const p = props as unknown as CapAlertEmailProps;
      if (!(p.headline && p.alertLink && p.unsubscribeLink)) {
        throw new Error(
          "cap-alert requires headline, alertLink and unsubscribeLink"
        );
      }
      return {
        element: CapAlertEmail(p),
        subject: `${p.label}: ${p.headline}`,
      };
    }
    case "newsletter": {
      const p = props as unknown as NewsletterEmailProps;
      if (!(p.headline && p.listName && p.unsubscribeLink)) {
        throw new Error(
          "newsletter requires headline, listName and unsubscribeLink"
        );
      }
      return {
        element: NewsletterEmail(p),
        subject: p.subject || `${p.listName}: ${p.headline}`,
      };
    }
    case "notification": {
      const p = props as unknown as NotificationEmailProps;
      return { element: NotificationEmail(p), subject: p.title };
    }
    case "organisation-invitation": {
      const p = props as unknown as OrganisationInvitationEmailProps;
      if (!(p.acceptLink && p.organisationName && p.inviterName)) {
        throw new Error(
          "organisation-invitation requires acceptLink, organisationName and inviterName"
        );
      }
      return {
        element: OrganisationInvitationEmail(p),
        subject: `You are invited to join ${p.organisationName}`,
      };
    }
    case "superuser-invitation": {
      const p = props as unknown as SuperuserInvitationEmailProps;
      if (!(p.acceptLink && p.inviterName && p.projectName)) {
        throw new Error(
          "superuser-invitation requires acceptLink, inviterName and projectName"
        );
      }
      return {
        element: SuperuserInvitationEmail(p),
        subject: `You are invited to be an administrator of ${p.projectName}`,
      };
    }
    case "reset-password": {
      requireFields("reset-password", props, ["resetLink"]);
      const p = props as unknown as ResetPasswordEmailProps;
      return {
        element: ResetPasswordEmail(p),
        subject: `${p.projectName} — Reset your password`,
      };
    }
    case "subscription-confirm": {
      const p = props as unknown as SubscriptionConfirmEmailProps;
      if (!(p.confirmLink && p.unsubscribeLink && p.listName)) {
        throw new Error("subscription-confirm requires its links and listName");
      }
      return {
        element: SubscriptionConfirmEmail(p),
        subject: `Confirm your subscription to ${p.listName}`,
      };
    }
    case "welcome": {
      const p = props as unknown as WelcomeEmailProps;
      return {
        element: WelcomeEmail(p),
        subject: `Welcome to ${p.projectName}`,
      };
    }
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unknown email template: ${_exhaustive}`);
    }
  }
}

// Headings keep their case in the plain-text part (html-to-text uppercases by default).
const PLAIN_TEXT_OPTIONS = {
  selectors: [{ selector: "h1", options: { uppercase: false } }],
};

export async function renderTemplate(
  template: TemplateName,
  props: Record<string, unknown>
): Promise<RenderResult> {
  const { element, subject } = build(template, props);
  const html = await render(element);
  return { html, subject, text: toPlainText(html, PLAIN_TEXT_OPTIONS) };
}
