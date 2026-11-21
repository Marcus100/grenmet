import { EmailLayout, type EmailLayoutProps } from "./components/layout";

/**
 * The generic card: any transactional mail whose content is one structured card
 * (bookings, events, verification codes). FastAPI builds the props
 * (`apps/api/fastapi/src/email_layout.py`, `EmailCard.to_props`). `subject` is
 * used by the render route, not shown in the body.
 */
export interface CardEmailProps extends EmailLayoutProps {
  subject: string;
}

export function CardEmail(props: CardEmailProps) {
  return <EmailLayout {...props} />;
}

export const PreviewProps = {
  subject: "Your booking at Sample Studio is confirmed",
  logo: {
    url: "https://cdn.example.test/sample-logo.png",
    alt: "Sample Studio",
  },
  eyebrow: "Sample Studio",
  chip: { label: "Confirmed", tone: "accent" },
  title: "Your booking is confirmed",
  greeting: "Hello Ann,",
  paragraphs: ["Thank you for booking with Sample Studio."],
  rows: [
    { label: "What", value: "Sample haircut with Alex" },
    {
      label: "When",
      value: "Friday 20 November 2026, 9:30 AM (Grenada time) · 45 minutes",
    },
    { label: "Reference", value: "ABCD1234" },
  ],
  primary: {
    label: "Manage booking",
    url: "https://booking.example.test/manage/sample",
  },
  secondary: [
    {
      label: "Add to Google Calendar",
      url: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    },
  ],
  policy: [
    "Changes made less than 24 hours before the start are arranged with Sample Studio.",
  ],
  quiet: "Booking never needs an account. If you would like one, it is free.",
  quietLink: {
    label: "Create a free account or sign in",
    url: "https://auth.example.test/signup",
  },
  footer:
    "You are getting this email because you booked with Sample Studio. Contact Sample Studio about this booking.",
  accent: "#0b132b",
  preview: "Your booking is confirmed for Friday 20 November",
} satisfies CardEmailProps;

CardEmail.PreviewProps = PreviewProps;

export default CardEmail;
