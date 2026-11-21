import { describe, expect, it } from "vitest";
import { renderTemplate } from "./render";

const INVITATION_EXPIRY = /expires in (<!-- -->)?24(<!-- -->)? hours/u;
const RESET_EXPIRY = /expires in (<!-- -->)?48(<!-- -->)? hours/u;
const WELCOME_BUTTON = /href="https:\/\/auth\.example\.test"/u;
const ROLE_ROW = /Your role[\s\S]*?member/u;
const INVITED_BY_ROW = /Invited by[\s\S]*?Alex Example/u;
const INVITE_DAYS = /expires in (<!-- -->)?7(<!-- -->)? days/u;

const base = {
  alerts: [],
  dateLabel: "28 Oct 2026",
  forecastLines: ["2026-10-28: high 31 °C, low 24 °C"],
  headline: "Today's update",
  hurricaneMode: false,
  listName: "GMS climate newsletter",
  posts: [],
  projectName: "Barrels Grenada",
  unsubscribeLink:
    "https://api.example.test/api/v1/subscriptions/unsubscribe?token=t",
};

describe("newsletter template", () => {
  it("renders the forecast and the one-click unsubscribe link", async () => {
    const { html, subject } = await renderTemplate("newsletter", base);
    expect(html).toContain("2026-10-28: high 31 °C, low 24 °C");
    expect(html).toContain(base.unsubscribeLink);
    expect(html).toContain("GMS climate newsletter");
    expect(html).not.toContain("Weather alerts in effect");
    expect(subject).toBe("GMS climate newsletter: Today's update");
  });

  it("links to the preferences page when one is given", async () => {
    const link =
      "https://gms.example.test/climate/newsletter/preferences?token=t";
    const { html } = await renderTemplate("newsletter", {
      ...base,
      preferencesLink: link,
    });
    expect(html).toContain("manage your subscriptions");
    expect(html).toContain(link.replace(/&/gu, "&amp;"));
  });

  it("omits the preferences sentence for mail that has no link", async () => {
    const { html } = await renderTemplate("newsletter", base);
    expect(html).not.toContain("manage your subscriptions");
  });

  it("puts the alerts block before the forecast when there are alerts", async () => {
    const { html } = await renderTemplate("newsletter", {
      ...base,
      alerts: [
        {
          areas: "Grenada",
          event: "Heavy rain",
          expires: "28 Oct 2026, 18:00",
          headline: "Yellow heavy rain warning",
          link: "https://weather.example.test/alerts/x",
        },
      ],
    });
    const alertsAt = html.indexOf("Weather alerts in effect");
    const forecastAt = html.indexOf("2026-10-28: high 31");
    expect(alertsAt).toBeGreaterThan(-1);
    expect(alertsAt).toBeLessThan(forecastAt);
    expect(html).toContain("Yellow heavy rain warning");
    expect(html).toContain("https://weather.example.test/alerts/x");
  });

  it("uses the digest subject the caller supplies", async () => {
    const { subject } = await renderTemplate("newsletter", {
      ...base,
      subject: "Weather alert: Flood - 28 Oct 2026",
    });
    expect(subject).toBe("Weather alert: Flood - 28 Oct 2026");
  });

  it("shows the test notice only when there is one", async () => {
    const plain = await renderTemplate("newsletter", base);
    expect(plain.html).not.toContain("This is a test copy");
    const test = await renderTemplate("newsletter", {
      ...base,
      testNotice:
        "This is a test copy for staff. It was not sent to subscribers.",
    });
    expect(test.html).toContain("This is a test copy for staff");
  });

  it("escapes post text", async () => {
    const { html } = await renderTemplate("newsletter", {
      ...base,
      posts: [
        {
          summary: "<img src=x onerror=alert(1)>",
          title: "<script>alert(1)</script>",
          url: "https://weather.example.test/stories/a",
        },
      ],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });

  it("refuses to render without an unsubscribe link", async () => {
    await expect(
      renderTemplate("newsletter", { ...base, unsubscribeLink: "" })
    ).rejects.toThrow("newsletter requires");
  });
});

describe("superuser invitation template", () => {
  const invitation = {
    acceptLink: "https://auth.example.test/superuser-invite?token=t",
    inviterName: "Alex Example",
    projectName: "Barrels Grenada",
    validHours: 24,
  };

  it("carries the single-use link and the 24-hour window", async () => {
    const { html, subject } = await renderTemplate(
      "superuser-invitation",
      invitation
    );
    expect(html).toContain("Alex Example invited you");
    // React puts comment markers between the interpolated number and "hours".
    expect(html).toMatch(INVITATION_EXPIRY);
    expect(html).toContain(invitation.acceptLink.replace(/&/gu, "&amp;"));
    expect(subject).toBe(
      "You are invited to be an administrator of Barrels Grenada"
    );
  });

  it("refuses to render without its link", async () => {
    await expect(
      renderTemplate("superuser-invitation", { ...invitation, acceptLink: "" })
    ).rejects.toThrow("superuser-invitation requires");
  });
});

describe("account and invitation templates on the shared layout", () => {
  const amp = (value: string) => value.replace(/&/gu, "&amp;");

  it("reset password carries the link, the expiry and a text fallback link", async () => {
    const props = {
      projectName: "Barrels Grenada",
      resetLink: "https://auth.example.test/reset-password?token=t&x=1",
      username: "jane@example.test",
      validHours: 48,
    };
    const { html, subject, text } = await renderTemplate(
      "reset-password",
      props
    );
    expect(subject).not.toContain("token=");
    expect(html).toContain("Reset your password");
    expect(html).toContain("Hello jane@example.test,");
    expect(html).toContain(amp(props.resetLink));
    expect(html).toMatch(RESET_EXPIRY);
    expect(text).toContain(props.resetLink);
  });

  it("reset password refuses to render without its link", async () => {
    await expect(
      renderTemplate("reset-password", {
        projectName: "Barrels Grenada",
        resetLink: "",
        username: "jane@example.test",
        validHours: 48,
      })
    ).rejects.toThrow("reset-password requires");
  });

  it("welcome lists the username and email and links to sign in", async () => {
    const { html } = await renderTemplate("welcome", {
      email: "jane@example.test",
      firstName: "Jane",
      projectName: "Barrels Grenada",
      signInLink: "https://auth.example.test",
      username: "janesmith",
    });
    expect(html).toContain("Hi Jane,");
    expect(html).toContain("janesmith");
    expect(html).toContain("jane@example.test");
    expect(html).toMatch(WELCOME_BUTTON);
  });

  it("organisation invitation names the organisation, role and inviter", async () => {
    const link = "https://auth.example.test/organisations/accept?token=t";
    const { html, subject } = await renderTemplate("organisation-invitation", {
      acceptLink: link,
      inviterName: "Alex Example",
      organisationName: "Example Ltd",
      projectName: "Barrels Grenada",
      roleLabel: "member",
      validDays: 7,
    });
    expect(html).toContain("Join Example Ltd");
    expect(html).toMatch(ROLE_ROW);
    expect(html).toMatch(INVITED_BY_ROW);
    expect(html).toMatch(INVITE_DAYS);
    expect(html).toContain(link);
    expect(subject).not.toContain("token=");
  });

  it("subscription confirmation keeps the confirm and unsubscribe links", async () => {
    const confirm = "https://api.example.test/subscriptions/confirm?token=t";
    const unsubscribe =
      "https://api.example.test/subscriptions/unsubscribe?token=t";
    const { html } = await renderTemplate("subscription-confirm", {
      confirmLink: confirm,
      listName: "Grenada Signal",
      projectName: "Barrels Grenada",
      unsubscribeLink: unsubscribe,
    });
    expect(html).toContain("Confirm your subscription to Grenada Signal");
    expect(html).toContain("The link expires in 7 days");
    expect(html).toContain(confirm);
    expect(html).toContain(unsubscribe);
  });

  it("drops a link that is not http or https", async () => {
    const { html } = await renderTemplate("reset-password", {
      projectName: "Barrels Grenada",
      resetLink: "javascript:alert(1)",
      username: "jane@example.test",
      validHours: 48,
    });
    expect(html).not.toContain("javascript:");
  });
});

describe("card template", () => {
  const card = {
    subject: "Your booking is confirmed",
    eyebrow: "Sample Studio",
    chip: { label: "Confirmed", tone: "accent" as const },
    title: "Your booking is confirmed",
    greeting: "Hello Ann,",
    paragraphs: ["Thank you for booking."],
    rows: [{ label: "What", value: "Haircut with Alex" }],
    primary: {
      label: "Manage booking",
      url: "https://booking.example.test/manage/x",
    },
    secondary: [
      {
        label: "Add to Google Calendar",
        url: "https://calendar.google.com/render?action=TEMPLATE&text=Haircut",
      },
    ],
    footer: "You are getting this email because you booked.",
  };

  it("renders the card with its subject and a plain-text part", async () => {
    const { html, subject, text } = await renderTemplate("card", card);
    expect(subject).toBe("Your booking is confirmed");
    expect(html).toContain("Haircut with Alex");
    expect(html).toContain('bgcolor="#0b132b"');
    expect(text).toContain("Your booking is confirmed");
    expect(text).toContain("Haircut with Alex");
    expect(text).toContain("https://booking.example.test/manage/x");
    expect(text).not.toContain("<");
  });

  it("escapes every value", async () => {
    const { html } = await renderTemplate("card", {
      ...card,
      title: "<script>alert(1)</script>",
      rows: [{ label: "<b>What</b>", value: "<img src=x onerror=alert(1)>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("drops links that are not absolute http(s) URLs", async () => {
    const { html, text } = await renderTemplate("card", {
      ...card,
      primary: { label: "Manage booking", url: "javascript:alert(1)" },
      secondary: [
        { label: "Calendar", url: "data:text/html,<b>x</b>" },
        { label: "Relative", url: "/manage/x" },
        { label: "Spaced", url: "https://ok.example.test/a b" },
      ],
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).not.toContain("Manage booking");
    expect(html).not.toContain("Calendar");
    expect(html).not.toContain("Relative");
    expect(html).not.toContain("Spaced");
    expect(text).not.toContain("javascript:");
  });

  it("falls back to navy when the accent fails 4.5:1 against white", async () => {
    const { html } = await renderTemplate("card", {
      ...card,
      accent: "#ffff00",
    });
    expect(html).not.toContain("#ffff00");
    expect(html).toContain('bgcolor="#0b132b"');
  });

  it("renders a verification code as a large monospace block", async () => {
    const { html, text } = await renderTemplate("card", {
      ...card,
      code: "482913",
    });
    expect(html).toContain("482913");
    expect(html).toContain("Courier New");
    expect(text).toContain("482913");
  });

  it("shows an https logo at 40px with its alt text, and drops other logo URLs", async () => {
    const logo = {
      url: "https://cdn.example.test/logo.png",
      alt: "Sample Studio",
    };
    const shown = await renderTemplate("card", { ...card, logo });
    expect(shown.html).toContain('src="https://cdn.example.test/logo.png"');
    expect(shown.html).toContain('alt="Sample Studio"');
    expect(shown.html).toContain("height:40px");
    const plain = await renderTemplate("card", {
      ...card,
      logo: { url: "http://cdn.example.test/logo.png", alt: "Sample Studio" },
    });
    expect(plain.html).not.toContain("<img");
    expect(plain.text).toContain("Your booking is confirmed");
  });

  it("refuses to render without a subject, title or footer", async () => {
    await expect(
      renderTemplate("card", { ...card, subject: "" })
    ).rejects.toThrow("card requires");
    await expect(
      renderTemplate("card", { ...card, title: "" })
    ).rejects.toThrow("card requires");
    await expect(
      renderTemplate("card", { ...card, footer: "" })
    ).rejects.toThrow("card requires");
  });
});

describe("notification template on the shared layout", () => {
  it("returns a plain-text part with the title and body", async () => {
    const { html, text } = await renderTemplate("notification", {
      projectName: "Grenmet",
      title: "Leave approved",
      body: "Your leave was approved.",
      linkUrl: "https://gms.example.test/hr",
    });
    expect(html).toContain("Leave approved");
    expect(text).toContain("Your leave was approved.");
    expect(text).toContain("https://gms.example.test/hr");
  });
});
