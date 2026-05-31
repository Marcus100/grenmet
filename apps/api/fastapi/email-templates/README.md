# Email Templates

MJML email templates for the FastAPI application.

## Structure

```
email-templates/
├── src/              ← MJML source files (edit these)
│   ├── new_account.mjml
│   ├── reset_password.mjml
│   └── test_email.mjml
└── build/            ← Compiled HTML output (used by the app at runtime)
    ├── new_account.html
    ├── reset_password.html
    └── test_email.html
```

Always edit the `.mjml` source files and compile to HTML — do not edit the `build/` HTML directly.

## Editing and building

Install the MJML CLI (one-time):

```bash
npm install -g mjml
```

Compile a single template:

```bash
mjml email-templates/src/new_account.mjml -o email-templates/build/new_account.html
```

Compile all templates:

```bash
cd email-templates/src
for file in *.mjml; do
  mjml "$file" -o "../build/${file%.mjml}.html"
done
```

After compiling, commit both the `.mjml` source and the `.html` output.

Preview templates live at [mjml.io/try-it-live](https://mjml.io/try-it-live).

## Template variables

### `new_account.mjml`

| Variable | Description |
|---|---|
| `{{ project_name }}` | Project name from settings |
| `{{ username }}` | User's username |
| `{{ password }}` | User's password |
| `{{ email }}` | User's email |
| `{{ link }}` | Link to dashboard/app |

### `reset_password.mjml`

| Variable | Description |
|---|---|
| `{{ project_name }}` | Project name |
| `{{ username }}` | User's username |
| `{{ email }}` | User's email |
| `{{ valid_hours }}` | Token validity in hours |
| `{{ link }}` | Password reset link |

### `test_email.mjml`

| Variable | Description |
|---|---|
| `{{ project_name }}` | Project name |
| `{{ email }}` | Recipient email |

## Testing

Send a test email via the API:

```bash
curl -X POST "http://localhost:8000/api/v1/utils/test-email?email_to=test@weather.gd"
```

View the result in MailCatcher: `http://localhost:1080`

## Troubleshooting

**Templates not found at runtime:**

```bash
docker compose exec api ls -la /app/email-templates/build/
```

**MJML build errors:**

```bash
mjml --validate email-templates/src/new_account.mjml
```

**Email not sending:**

```bash
docker compose logs -f api
```
