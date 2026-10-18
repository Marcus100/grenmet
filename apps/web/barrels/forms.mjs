// Contact and newsletter forms for barrels.gd. Progressive enhancement: the
// pages work as static HTML, and without JavaScript the forms are not sent
// (CSP form-action 'none', plus a noscript notice). Plain fetch to FastAPI;
// no third-party scripts.

// Production API. Local preview talks to a locally running FastAPI.
const API_ORIGIN =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://api.barrels.gd";
const CONTACT_URL = `${API_ORIGIN}/api/v1/contact/messages`;
const SUBSCRIBE_URL = `${API_ORIGIN}/api/v1/subscriptions`;

const MESSAGES = {
  sending: "Sending…",
  rejected: "Check the highlighted fields and try again.",
  rateLimited:
    "Too many attempts from this connection. Wait a minute and try again.",
  failed: "We could not send this right now. Please try again later.",
  network:
    "We could not reach the server. Check your connection and try again.",
};

const CONTACT_SUCCESS =
  "Thanks. Your message has been sent. We will reply to the email address you gave.";
const SUBSCRIBE_SUCCESS =
  "If this address can be subscribed, we have sent a confirmation email. Follow the link in it to finish.";

// Result values set by the API's confirm and unsubscribe redirects.
const STATUS_TEXT = {
  confirmed:
    "Thanks. Your subscription is confirmed. You will hear from us by email.",
  unsubscribed:
    "You have been unsubscribed. You will not receive more email from this list.",
  invalid:
    "This link is invalid or has expired. Subscribe again to get a new link.",
};

function problemWith(field) {
  const value = field.value.trim();
  if (!value) return field.required ? "This field is required." : "";
  if (field.type === "email" && field.validity.typeMismatch)
    return "Enter a valid email address.";
  if (field.minLength > 0 && value.length < field.minLength)
    return `Use at least ${field.minLength} characters.`;
  if (field.maxLength >= 0 && value.length > field.maxLength)
    return `Use no more than ${field.maxLength} characters.`;
  return "";
}

function showProblem(field, message) {
  const error = document.getElementById(`${field.id}-error`);
  field.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function setStatus(element, text, tone) {
  element.textContent = text;
  element.className = `form-status${tone ? ` ${tone}` : ""}`;
}

function setupForm(form, { url, body, success }) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');
  const fields = [...form.querySelectorAll("[data-validate]")];

  for (const field of fields) {
    field.addEventListener("blur", () => {
      if (field.value) showProblem(field, problemWith(field));
    });
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true")
        showProblem(field, problemWith(field));
    });
  }

  form.addEventListener("submit", async (event) => {
    // Never fall back to a native submit: the URL would carry the email address.
    event.preventDefault();
    const problems = fields.map((field) => [field, problemWith(field)]);
    for (const [field, message] of problems) showProblem(field, message);
    const first = problems.find(([, message]) => message);
    if (first) {
      first[0].focus();
      setStatus(status, MESSAGES.rejected, "error");
      return;
    }

    // Honeypot: a filled hidden field is treated as a bot. Show success, send nothing.
    const honeypot = form.querySelector('input[name="website"]');
    if (honeypot?.value) {
      form.reset();
      setStatus(status, success, "success");
      return;
    }

    button.disabled = true;
    setStatus(status, MESSAGES.sending, "");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(form)),
      });
      if (response.status === 202) {
        const data = await response.json().catch(() => ({}));
        form.reset();
        setStatus(status, data.message ?? success, "success");
      } else if (response.status === 429) {
        setStatus(status, MESSAGES.rateLimited, "error");
      } else if (response.status === 400 || response.status === 422) {
        setStatus(status, MESSAGES.rejected, "error");
      } else {
        setStatus(status, MESSAGES.failed, "error");
      }
    } catch {
      setStatus(status, MESSAGES.network, "error");
    } finally {
      button.disabled = false;
    }
  });
}

const value = (form, name) => form.elements.namedItem(name)?.value.trim() ?? "";

const contactForm = document.getElementById("contact-form");
if (contactForm)
  setupForm(contactForm, {
    url: CONTACT_URL,
    success: CONTACT_SUCCESS,
    body: (form) => ({
      site: "barrels",
      name: value(form, "name"),
      email: value(form, "email"),
      subject: value(form, "subject"),
      message: value(form, "message"),
    }),
  });

const newsletterForm = document.getElementById("newsletter-form");
if (newsletterForm)
  setupForm(newsletterForm, {
    url: SUBSCRIBE_URL,
    success: SUBSCRIBE_SUCCESS,
    body: (form) => ({ list_key: "barrels", email: value(form, "email") }),
  });

const statusText = document.getElementById("status-text");
if (statusText) {
  const result = new URLSearchParams(location.search).get("result");
  if (result && Object.hasOwn(STATUS_TEXT, result))
    statusText.textContent = STATUS_TEXT[result];
}
