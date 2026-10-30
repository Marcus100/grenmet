import re
from html.parser import HTMLParser

from django.db import migrations

# The rich-text editor (CKEditor 4, issue #803) was replaced by plain text
# boxes, so the HTML it stored is converted to plain text once, here.
# (model, field) pairs that held editor HTML:
RICH_TEXT_FIELDS = (
    ("EquipmentType", "report_template"),
    ("MaintenanceReport", "station_on_arrival_conditions"),
    ("MaintenanceReport", "contacts"),
    ("MaintenanceReport", "current_visit_summary"),
    ("MaintenanceReport", "next_visit_summary"),
    ("MaintenanceReportEquipment", "condition"),
)

_PARAGRAPH_TAGS = {"p", "ul", "ol", "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"}
_LINE_TAGS = {"div", "li", "tr", "hr"}
_SKIPPED_TAGS = {"script", "style"}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self._skip_depth = 0

    def _ensure_newline(self):
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_starttag(self, tag, attrs):
        if tag in _SKIPPED_TAGS:
            self._skip_depth += 1
        elif tag == "br":
            self.parts.append("\n")
        elif tag == "li":
            self._ensure_newline()
            self.parts.append("- ")
        elif tag in _PARAGRAPH_TAGS or tag in _LINE_TAGS:
            self._ensure_newline()

    def handle_startendtag(self, tag, attrs):
        if tag in ("br", "hr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIPPED_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in _PARAGRAPH_TAGS:
            self.parts.append("\n\n")
        elif tag in _LINE_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip_depth:
            self.parts.append(data)


def html_to_plain_text(value):
    """Turn editor HTML into plain text, keeping line breaks and the text."""
    if not value:
        return value
    extractor = _TextExtractor()
    extractor.feed(value)
    extractor.close()
    text = "".join(extractor.parts).replace("\xa0", " ").replace("\r\n", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def strip_html(apps, schema_editor):
    for model_name, field_name in RICH_TEXT_FIELDS:
        model = apps.get_model("wx", model_name)
        rows = model.objects.exclude(**{field_name: None}).exclude(**{field_name: ""})
        for obj in rows.iterator():
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
