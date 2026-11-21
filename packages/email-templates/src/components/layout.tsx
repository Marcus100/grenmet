import { Body, Head, Html, Img, Preview } from "react-email";

/**
 * The house email layout (docs/email-design.md): page background, white 600px
 * card, eyebrow, status chip, title, greeting, paragraphs, a code block, details
 * rows, money rows, one primary button, secondary buttons, a copy-the-link line,
 * policy lines, a quiet paragraph, a divider and a footer.
 *
 * Brand-neutral: every name and link comes from the caller. Text is escaped by
 * React; links must be absolute http(s) (anything else is dropped); the accent
 * falls back to the Barrels navy unless it clears 4.5:1 against white.
 */

export const NAVY = "#0b132b";
const PAGE = "#f3f8fc";
const FONT = "Arial, Helvetica, sans-serif";
const MIN_CONTRAST = 4.5;
const HEX = /^#[0-9a-fA-F]{6}$/u;

export interface CardRow {
  label: string;
  value: string;
}

export interface CardMoney extends CardRow {
  strong?: boolean;
}

export interface CardAction {
  label: string;
  url: string;
}

export interface CardChip {
  label: string;
  tone?: "accent" | "muted";
}

export interface CardLogo {
  alt: string;
  url: string;
}

export interface EmailLayoutProps {
  accent?: string | null;
  chip?: CardChip | null;
  code?: string | null;
  eyebrow?: string | null;
  footer: string;
  greeting?: string | null;
  linkFallback?: string | null;
  logo?: CardLogo | null;
  money?: CardMoney[];
  paragraphs?: string[];
  policy?: string[];
  preview?: string | null;
  primary?: CardAction | null;
  quiet?: string | null;
  quietLink?: CardAction | null;
  rows?: CardRow[];
  secondary?: CardAction[];
  title: string;
}

/** The URL when it is an absolute http(s) address with no spaces or control
 * characters; otherwise null (the caller then drops the link). */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127) {
      return null;
    }
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return url.hostname ? value : null;
}

function channel(hex: string, start: number): number {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** A logo must be https: images are fetched from the business's own host. */
export function safeLogo(logo: CardLogo | null | undefined): CardLogo | null {
  const url = safeUrl(logo?.url);
  if (!(logo && url && new URL(url).protocol === "https:")) {
    return null;
  }
  return { url, alt: logo.alt };
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

/** The legacy bgcolor attribute (Outlook reads it; the style covers the rest). */
function bgcolorAttribute(color: string): { bgcolor: string } {
  return { bgcolor: color };
}

/** The accent when it is six-digit hex and reaches 4.5:1 against white, else navy. */
export function safeAccent(value: string | null | undefined): string {
  if (
    value &&
    HEX.test(value) &&
    1.05 / (luminance(value) + 0.05) >= MIN_CONTRAST
  ) {
    return value.toLowerCase();
  }
  return NAVY;
}

function Button({
  action,
  accent,
  primary,
}: {
  action: CardAction;
  accent: string;
  primary: boolean;
}) {
  const background = primary ? accent : "#ffffff";
  const text = primary ? "#ffffff" : accent;
  const href = safeUrl(action.url);
  if (!href) {
    return null;
  }
  return (
    <table
      border={0}
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ margin: "0 0 12px" }}
      width="100%"
    >
      <tbody>
        <tr>
          <td
            align="center"
            {...bgcolorAttribute(background)}
            style={{
              backgroundColor: background,
              border: primary ? "none" : `2px solid ${accent}`,
              borderRadius: 8,
              padding: "12px 24px",
            }}
          >
            <a
              href={href}
              style={{
                display: "block",
                lineHeight: "20px",
                fontFamily: FONT,
                fontSize: 16,
                fontWeight: "bold",
                color: text,
                textDecoration: "none",
                textAlign: "center",
                borderRadius: 8,
              }}
            >
              {action.label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Details({ rows }: { rows: CardRow[] }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <table
      border={0}
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ margin: "8px 0 20px" }}
      width="100%"
    >
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.label}:${row.value}`}>
            <td
              style={{
                width: 88,
                padding: "10px 12px 10px 0",
                borderTop: "1px solid #e5e7eb",
                color: "#6b7280",
                fontFamily: FONT,
                fontSize: 13,
                lineHeight: "20px",
              }}
              valign="top"
            >
              {row.label}
            </td>
            <td
              style={{
                padding: "10px 0",
                borderTop: "1px solid #e5e7eb",
                color: "#0b132b",
                fontFamily: FONT,
                fontSize: 15,
                lineHeight: "22px",
              }}
              valign="top"
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Chip({ chip, accent }: { chip: CardChip; accent: string }) {
  const muted = chip.tone === "muted";
  const background = muted ? "#e5e7eb" : accent;
  return (
    <table
      border={0}
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ margin: "0 0 16px" }}
    >
      <tbody>
        <tr>
          <td
            {...bgcolorAttribute(background)}
            style={{
              backgroundColor: background,
              borderRadius: 999,
              padding: "4px 12px",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: "bold",
              lineHeight: "18px",
              color: muted ? "#111827" : "#ffffff",
            }}
          >
            {chip.label}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <table
      border={0}
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ margin: "8px 0 20px" }}
      width="100%"
    >
      <tbody>
        <tr>
          <td
            align="center"
            {...bgcolorAttribute("#f3f4f6")}
            style={{
              backgroundColor: "#f3f4f6",
              borderRadius: 8,
              padding: "20px 16px",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 32,
              lineHeight: "40px",
              fontWeight: "bold",
              letterSpacing: 6,
              color: "#0b132b",
            }}
          >
            {code}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailLayout(props: EmailLayoutProps) {
  const accent = safeAccent(props.accent);
  const paragraphs = props.paragraphs ?? [];
  const rows = (props.rows ?? []).filter((row) => row.value);
  const money = (props.money ?? []).filter((row) => row.value);
  const primary =
    props.primary && safeUrl(props.primary.url) ? props.primary : null;
  const secondary = (props.secondary ?? []).filter((action) =>
    safeUrl(action.url)
  );
  const fallback = safeUrl(props.linkFallback);
  const logo = safeLogo(props.logo);
  const quietLink =
    props.quietLink && safeUrl(props.quietLink.url) ? props.quietLink : null;

  return (
    <Html dir="ltr" lang="en">
      <Head>
        <meta content="light" name="color-scheme" />
        <meta content="light" name="supported-color-schemes" />
      </Head>
      <Preview>{props.preview || props.title}</Preview>
      <Body style={{ backgroundColor: PAGE, margin: 0, padding: 0 }}>
        <table
          border={0}
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          width="100%"
          {...bgcolorAttribute(PAGE)}
          style={{ backgroundColor: PAGE }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table
                  {...bgcolorAttribute("#ffffff")}
                  border={0}
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{
                    width: "100%",
                    maxWidth: 600,
                    backgroundColor: "#ffffff",
                    borderRadius: 8,
                  }}
                  width={600}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "32px 40px",
                          fontFamily: FONT,
                          color: "#374151",
                        }}
                      >
                        {logo ? (
                          <Img
                            alt={logo.alt}
                            height={40}
                            src={logo.url}
                            style={{
                              display: "block",
                              height: 40,
                              border: 0,
                              marginBottom: 16,
                            }}
                          />
                        ) : null}
                        {props.eyebrow ? (
                          <p
                            style={{
                              margin: "0 0 8px",
                              fontSize: 13,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              color: "#6b7280",
                            }}
                          >
                            {props.eyebrow}
                          </p>
                        ) : null}
                        {props.chip ? (
                          <Chip accent={accent} chip={props.chip} />
                        ) : null}
                        <h1
                          style={{
                            margin: "0 0 16px",
                            fontSize: 24,
                            lineHeight: "32px",
                            fontWeight: "bold",
                            color: "#0b132b",
                          }}
                        >
                          {props.title}
                        </h1>
                        {props.greeting ? (
                          <p style={bodyText}>{props.greeting}</p>
                        ) : null}
                        {paragraphs.map((paragraph) => (
                          <p key={paragraph} style={bodyText}>
                            {paragraph}
                          </p>
                        ))}
                        {props.code ? <CodeBlock code={props.code} /> : null}
                        <Details rows={[...rows, ...money]} />
                        {primary ? (
                          <Button accent={accent} action={primary} primary />
                        ) : null}
                        {secondary.map((action) => (
                          <Button
                            accent={accent}
                            action={action}
                            key={action.label}
                            primary={false}
                          />
                        ))}
                        {fallback ? (
                          <p style={{ ...quietText, margin: "0 0 16px" }}>
                            If the button does not work, copy this link into
                            your browser:
                            <br />
                            <a
                              href={fallback}
                              style={{
                                color: accent,
                                wordBreak: "break-all",
                                textDecoration: "underline",
                              }}
                            >
                              {fallback}
                            </a>
                          </p>
                        ) : null}
                        {(props.policy ?? []).map((line) => (
                          <p key={line} style={policyText}>
                            {line}
                          </p>
                        ))}
                        {props.quiet ? (
                          <p style={{ ...quietText, margin: "16px 0 0" }}>
                            {props.quiet}
                            {quietLink ? (
                              <>
                                {" "}
                                <a
                                  href={quietLink.url}
                                  style={{
                                    color: accent,
                                    fontWeight: "bold",
                                    textDecoration: "underline",
                                  }}
                                >
                                  {quietLink.label}
                                </a>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        <hr
                          style={{
                            border: 0,
                            borderTop: "1px solid #d0d5dd",
                            margin: "24px 0",
                          }}
                        />
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            lineHeight: "20px",
                            color: "#6b7280",
                          }}
                        >
                          {props.footer}
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

const bodyText = {
  margin: "0 0 12px",
  fontSize: 16,
  lineHeight: "24px",
  color: "#374151",
} as const;

const quietText = {
  margin: 0,
  fontSize: 14,
  lineHeight: "21px",
  color: "#6b7280",
} as const;

const policyText = {
  margin: "0 0 12px",
  fontSize: 14,
  lineHeight: "21px",
  color: "#4b5563",
} as const;
