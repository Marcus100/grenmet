"""Convert the HTML that CKEditor 4 stored (issue #803) into plain text, once.

THIS DATA MIGRATION CANNOT BE UNDONE: the reverse is a no-op and the original
HTML is not recoverable. Take a database dump (`pg_dump`, or a copy of the
data/postgresql volume) BEFORE running `migrate`.

Only the tags CKEditor 4 emits are removed; any other text, including `<` and
`>` characters in plain text, is left alone.
"""
import html
import re

from django.db import migrations

# (model, field) pairs that held editor HTML:
RICH_TEXT_FIELDS = (
    ("EquipmentType", "report_template"),
    ("MaintenanceReport", "station_on_arrival_conditions"),
    ("MaintenanceReport", "contacts"),
    ("MaintenanceReport", "current_visit_summary"),
    ("MaintenanceReport", "next_visit_summary"),
    ("MaintenanceReportEquipment", "condition"),
)
CHUNK_SIZE = 500

_TAG_NAMES = (
    "p|br|div|span|strong|b|em|i|u|s|strike|sub|sup|ul|ol|li|a|h[1-6]|"
    "blockquote|pre|code|table|thead|tbody|tr|td|th|hr|img|font"
)
# A recognised tag is well formed: quoted attributes only, no `<` or `>` inside,
# so an unclosed or odd-looking "<..." in plain text never matches.
_TAG_RE = re.compile(
    r"<(/?)(" + _TAG_NAMES + r")"
    r"((?:\s+[a-zA-Z_:][-\w:.]*\s*=\s*(?:\"[^\"<>]*\"|'[^'<>]*'))*)"
    r"\s*/?>",
    re.IGNORECASE,
)
_SCRIPT_START_RE = re.compile(r"<(script|style)\b[^<>]*>", re.IGNORECASE)
_PARAGRAPH_TAGS = {"p", "ul", "ol", "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"}
_LINE_TAGS = {"div", "tr", "hr"}


def _drop_script_and_style(text):
    """Remove properly closed <script>/<style> blocks; leave unclosed ones."""
    out = []
    pos = 0
    while True:
        start = _SCRIPT_START_RE.search(text, pos)
        if not start:
            break
        close = re.compile(r"</" + start.group(1) + r"\s*>", re.IGNORECASE).search(text, start.end())
        if not close:
            break  # unclosed: nothing later can close either; keep the rest
        out.append(text[pos:start.start()])
        pos = close.end()
    out.append(text[pos:])
    return "".join(out)


def _replace_tag(match):
    closing, name = match.group(1), match.group(2).lower()
    if name == "br":
        return "\n"
    if name == "li":
        return "\n" if closing else "\n- "
    if name in _PARAGRAPH_TAGS:
        return "\n\n" if closing else "\n"
    if name in _LINE_TAGS:
        return "\n"
    return ""


def html_to_plain_text(value):
    """Turn editor HTML into plain text, keeping line breaks and all text."""
    if not value:
        return value
    text = _drop_script_and_style(value)
    text = _TAG_RE.sub(_replace_tag, text)
    text = html.unescape(text).replace("\xa0", " ").replace("\r\n", "\n")
    lines = [line.rstrip() for line in text.split("\n")]  # linear, unlike a regex
    cleaned = []
    for index, line in enumerate(lines):
        if not line and cleaned and cleaned[-1].startswith("- "):
            following = next((x for x in lines[index + 1:] if x), "")
            if following.startswith("- "):
                continue  # no blank line between list items
        if not line and cleaned and not cleaned[-1]:
            continue  # at most one blank line in a row
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def strip_html(apps, schema_editor):
    for model_name, field_name in RICH_TEXT_FIELDS:
        model = apps.get_model("wx", model_name)
        rows = model.objects.exclude(**{field_name: None}).exclude(**{field_name: ""}).only("pk", field_name)
        for obj in rows.iterator(chunk_size=CHUNK_SIZE):
            old = getattr(obj, field_name)
            new = html_to_plain_text(old)
            if new != old:
                model.objects.filter(pk=obj.pk).update(**{field_name: new})


class Migration(migrations.Migration):

    dependencies = [
        ("wx", "0078_alter_qualityflag_color_alter_variable_color"),
    ]

    operations = [
        # Reverse is a no-op: the original HTML cannot be recovered.
        migrations.RunPython(strip_html, migrations.RunPython.noop),
    ]
