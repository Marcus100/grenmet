# 📧 Email Templates

This folder contains email templates for the FastAPI application.

---

## 📁 Structure

```
email-templates/
├── src/              ← MJML source files (editable)
│   ├── new_account.mjml
│   ├── reset_password.mjml
│   └── test_email.mjml
└── build/            ← HTML output files (used by app)
    ├── new_account.html
    ├── reset_password.html
    └── test_email.html
```

---

## 🎨 Editing Templates

### Method 1: Edit MJML (Recommended)

MJML is a responsive email framework that makes it easy to create beautiful emails.

**Benefits:**

- Simple, semantic markup
- Automatically generates responsive HTML
- Cross-client compatible (Gmail, Outlook, etc.)
- Much easier than writing raw HTML

**Example:**

```mjml
<mj-button href="{{ link }}" background-color="#009688"> Click Here </mj-button>
```

vs raw HTML (100+ lines of table markup) 😱

### Method 2: Edit HTML Directly

You can also edit the HTML files in `build/` directly if you prefer.

---

## 🔨 Building Templates

### Install MJML CLI

```bash
# Using npm
npm install -g mjml

# Or using yarn
yarn global add mjml
```

### Build Single Template

```bash
# From project root
mjml email-templates/src/new_account.mjml -o email-templates/build/new_account.html
```

### Build All Templates

```bash
# Build all templates at once
cd email-templates/src
for file in *.mjml; do
  mjml "$file" -o "../build/${file%.mjml}.html"
done
```

### Or Create a Build Script

Create `email-templates/build.sh`:

```bash
#!/bin/bash
for file in src/*.mjml; do
  filename=$(basename "$file" .mjml)
  mjml "$file" -o "build/${filename}.html"
  echo "✓ Built ${filename}.html"
done
```

---

## 🧪 Testing Templates

### 1. Online MJML Editor

Try templates live: https://mjml.io/try-it-live

### 2. Test Email Endpoint

Send test email via API:

```bash
# Using curl
curl -X POST "http://localhost:8000/api/v1/utils/test-email?email_to=test@weather.gd"

# Using httpie
http POST http://localhost:8000/api/v1/utils/test-email email_to=test@weather.gd
```

### 3. Check MailCatcher

View sent emails: http://localhost:1080

---

## 📝 Template Variables

### `new_account.mjml` / `new_account.html`

- `{{ project_name }}` - Project name from settings
- `{{ username }}` - User's username
- `{{ password }}` - User's password
- `{{ email }}` - User's email
- `{{ link }}` - Link to dashboard/app

### `reset_password.mjml` / `reset_password.html`

- `{{ project_name }}` - Project name
- `{{ username }}` - User's username
- `{{ email }}` - User's email
- `{{ valid_hours }}` - Token validity hours
- `{{ link }}` - Password reset link with token

### `test_email.mjml` / `test_email.html`

- `{{ project_name }}` - Project name
- `{{ email }}` - Recipient email

---

## 🎨 MJML Components

Common MJML components you'll use:

### Text

```mjml
<mj-text align="center" font-size="16px" color="#555"> Your text here </mj-text>
```

### Button

```mjml
<mj-button
  href="{{ link }}"
  background-color="#009688"
  color="#fff"
  border-radius="8px"
>
  Click Me
</mj-button>
```

### Divider

```mjml
<mj-divider border-color="#ccc" border-width="2px"></mj-divider>
```

### Image

```mjml
<mj-image width="200px" src="https://weather.gd/logo.png"></mj-image>
```

### Section & Column

```mjml
<mj-section background-color="#fff">
  <mj-column>
    <mj-text>Column 1</mj-text>
  </mj-column>
  <mj-column>
    <mj-text>Column 2</mj-text>
  </mj-column>
</mj-section>
```

---

## 🔗 Resources

### Documentation

- **MJML Docs**: https://mjml.io/documentation/
- **MJML Components**: https://mjml.io/documentation/#standard-body-components
- **MJML Try It Live**: https://mjml.io/try-it-live

### Inspiration

- **Really Good Emails**: https://reallygoodemails.com/
- **Email Love**: https://emaillove.com/

### Testing

- **Email on Acid**: https://www.emailonacid.com/
- **Litmus**: https://www.litmus.com/

---

## 🚀 Workflow

### Making Changes

1. **Edit MJML**

   ```bash
   # Edit the source file
   vim email-templates/src/new_account.mjml
   ```

2. **Build to HTML**

   ```bash
   mjml email-templates/src/new_account.mjml -o email-templates/build/new_account.html
   ```

3. **Test**

   ```bash
   # Send test email
   curl -X POST "http://localhost:8000/api/v1/utils/test-email?email_to=test@weather.gd"

   # Check MailCatcher
   open http://localhost:1080
   ```

4. **Commit Both**
   ```bash
   git add email-templates/src/new_account.mjml
   git add email-templates/build/new_account.html
   git commit -m "Update new account email template"
   ```

---

## ⚡ Quick Tips

### 1. Keep It Simple

- Use standard MJML components
- Avoid custom CSS when possible
- Test in multiple email clients

### 2. Mobile First

- MJML is responsive by default
- Test on mobile and desktop
- Use readable font sizes (16px+)

### 3. Accessibility

- Use descriptive alt text for images
- Ensure good color contrast
- Use semantic HTML structure

### 4. Variables

- Always use template variables (don't hardcode)
- Test with different variable values
- Handle missing variables gracefully

---

## 🐛 Troubleshooting

### Templates Not Loading

```bash
# Check file exists
ls -la email-templates/build/

# Check Docker volume
docker compose exec api ls -la /app/email-templates/build/
```

### MJML Build Errors

```bash
# Check MJML version
mjml --version

# Validate MJML
mjml --validate email-templates/src/new_account.mjml
```

### Email Not Sending

```bash
# Check logs
docker compose logs -f api

# Test SMTP connection
docker compose exec api python -c "import smtplib; smtplib.SMTP('mailcatcher', 1025)"
```

---

## 📞 Need Help?

1. Check MJML documentation
2. Test in MJML Try It Live editor
3. Check MailCatcher for sent emails
4. Review API logs for errors

---

**Happy emailing!** 📧 ✨
