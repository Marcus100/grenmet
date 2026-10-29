import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

export interface NewsletterAlert {
  areas: string;
  event: string;
  expires?: string | null;
  headline: string;
  link: string;
}

export interface NewsletterPost {
  summary: string;
  title: string;
  url: string;
}

/**
 * The daily climate newsletter: weather alerts in effect, then a short forecast
 * summary, then posts flagged for the newsletter. Brand-neutral: the caller
 * supplies every name and link. Each mail carries only its recipient's own
 * unsubscribe link.
 */
export interface NewsletterEmailProps {
  alerts: NewsletterAlert[];
  dateLabel: string;
  forecastLines: string[];
  headline: string;
  hurricaneMode: boolean;
  listName: string;
  posts: NewsletterPost[];
  projectName: string;
  subject?: string;
  testNotice?: string | null;
  unsubscribeLink: string;
}

export function NewsletterEmail({
  alerts,
  dateLabel,
  forecastLines,
  headline,
  hurricaneMode,
  listName,
  posts,
  projectName,
  testNotice,
  unsubscribeLink,
}: NewsletterEmailProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>{`${headline} - ${dateLabel}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>
              {projectName} · {listName}
            </Text>
            <Text style={heading}>{headline}</Text>
            <Text style={dateStyle}>{dateLabel}</Text>
            {testNotice ? <Text style={notice}>{testNotice}</Text> : null}
          </Section>

          {alerts.length > 0 ? (
            <Section style={content}>
              <Text style={sectionHeading}>Weather alerts in effect</Text>
              {alerts.map((alert) => (
                <Section key={alert.link} style={alertBlock}>
                  <Text style={alertTitle}>{alert.headline}</Text>
                  <Text style={paragraph}>
                    {alert.event}
                    {alert.areas ? ` for ${alert.areas}` : ""}
                    {alert.expires ? `. Expires ${alert.expires}` : ""}.
                  </Text>
                  <Text style={paragraph}>
                    <Link href={alert.link}>Read the full alert</Link>
                  </Text>
                </Section>
              ))}
              <Text style={small}>
                Do not rely on email alone in an emergency.
              </Text>
            </Section>
          ) : null}

          {forecastLines.length > 0 ? (
            <Section style={content}>
              <Text style={sectionHeading}>
                {hurricaneMode ? "Outlook" : "Forecast"}
              </Text>
              {forecastLines.map((line) => (
                <Text key={line} style={paragraph}>
                  {line}
                </Text>
              ))}
            </Section>
          ) : null}

          {posts.length > 0 ? (
            <Section style={content}>
              <Text style={sectionHeading}>From the desk</Text>
              {posts.map((post) => (
                <Section key={post.url} style={postBlock}>
                  <Text style={postTitle}>
                    <Link href={post.url}>{post.title}</Link>
                  </Text>
                  {post.summary ? (
                    <Text style={paragraph}>{post.summary}</Text>
                  ) : null}
                </Section>
              ))}
            </Section>
          ) : null}

          <Section style={content}>
            <Hr style={divider} />
            <Text style={footer}>
              You receive this because you confirmed a subscription to{" "}
              {listName}. Do not rely on email alone in an emergency. Stop
              receiving it at any time:{" "}
              <Link href={unsubscribeLink}>unsubscribe</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

NewsletterEmail.PreviewProps = {
  alerts: [],
  dateLabel: "28 Oct 2026",
  forecastLines: ["2026-10-28: high 31 °C, low 24 °C"],
  headline: "Today's update",
  hurricaneMode: false,
  listName: "GMS climate newsletter",
  posts: [
    {
      summary: "Rainfall was above normal across the island.",
      title: "September rainfall review",
      url: "https://weather.example.test/stories/rain",
    },
  ],
  projectName: "Barrels Grenada",
  testNotice: null,
  unsubscribeLink:
    "https://api.example.test/api/v1/subscriptions/unsubscribe?token=x",
} satisfies NewsletterEmailProps;

export default NewsletterEmail;

// ─── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f3f8fc",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  backgroundColor: "#ffffff",
  padding: "32px 40px 0",
};

const eyebrow: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  letterSpacing: "0.04em",
  margin: "0 0 8px",
  textTransform: "uppercase",
};

const heading: React.CSSProperties = {
  color: "#0b132b",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: 0,
};

const dateStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "4px 0 0",
};

const notice: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  borderLeft: "4px solid #f59e0b",
  color: "#7c2d12",
  fontSize: "14px",
  margin: "16px 0 0",
  padding: "10px 14px",
};

const content: React.CSSProperties = {
  padding: "20px 40px 0",
};

const sectionHeading: React.CSSProperties = {
  color: "#0b132b",
  fontSize: "17px",
  fontWeight: "600",
  margin: "0 0 8px",
};

const alertBlock: React.CSSProperties = {
  borderLeft: "4px solid #b91c1c",
  margin: "0 0 12px",
  padding: "8px 14px",
};

const alertTitle: React.CSSProperties = {
  color: "#0b132b",
  fontSize: "16px",
  fontWeight: "600",
  margin: 0,
};

const postBlock: React.CSSProperties = {
  margin: "0 0 12px",
};

const postTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  margin: "0",
};

const paragraph: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "4px 0",
};

const small: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "13px",
  margin: "0 0 8px",
};

const divider: React.CSSProperties = {
  borderColor: "#d0d5dd",
  margin: "0 0 20px",
};

const footer: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 24px",
};
