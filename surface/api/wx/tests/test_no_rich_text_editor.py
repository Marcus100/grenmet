import importlib
import time
from django.apps import apps
from django.conf import settings
from django.db import models
from django.template.loader import render_to_string
from django.test import SimpleTestCase, TestCase

from wx.models import EquipmentType

strip_migration = importlib.import_module("wx.migrations.0079_strip_html_from_rich_text_fields")

RICH_TEXT_FIELDS = (
    ("EquipmentType", "report_template"),
    ("MaintenanceReport", "station_on_arrival_conditions"),
    ("MaintenanceReport", "contacts"),
    ("MaintenanceReport", "current_visit_summary"),
    ("MaintenanceReport", "next_visit_summary"),
    ("MaintenanceReportEquipment", "condition"),
)


class RichTextEditorRemovedTests(SimpleTestCase):
    """CKEditor 4 is end of life (#803): the fields are plain text boxes now."""

    def test_former_rich_text_fields_are_plain_text_fields(self):
        for model_name, field_name in RICH_TEXT_FIELDS:
            field = apps.get_model("wx", model_name)._meta.get_field(field_name)
            self.assertIs(type(field), models.TextField, f"{model_name}.{field_name}")

    def test_ckeditor_is_not_installed(self):
        self.assertNotIn("ckeditor", settings.INSTALLED_APPS)
        self.assertFalse(hasattr(settings, "CKEDITOR_CONFIGS"))
        with self.assertRaises(ImportError):
            importlib.import_module("ckeditor")

    def test_report_view_escapes_stored_html(self):
        html = render_to_string(
            "wx/maintenance_reports/view_report.html",
            {
                "visit_summary_information": {
                    "station_on_arrival_conditions": "<script>alert(1)</script>",
                    "current_visit_summary": "<b onmouseover=x>done</b>",
                    "next_visit_summary": "<img src=x onerror=y>",
                },
                "contact_information": "<script>alert(2)</script>",
                "station_information": {},
                "equipment_records": [],
            },
        )
        for raw in ("<script>alert(1)</script>", "<b onmouseover=x>", "<img src=x onerror=y>", "<script>alert(2)</script>"):
            self.assertNotIn(raw, html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertNotIn("v-html=\"equipment_record.condition\"", html)


class StripHtmlTests(SimpleTestCase):
    def test_line_breaks_and_text_are_kept(self):
        self.assertEqual(
            strip_migration.html_to_plain_text("<p>Rain gauge &amp; mast</p><p>Cleaned&nbsp;it<br />Done</p>"),
            "Rain gauge & mast\n\nCleaned it\nDone",
        )

    def test_lists_and_closed_scripts(self):
        self.assertEqual(
            strip_migration.html_to_plain_text("<ul><li>one</li><li>two</li></ul><script>alert(1)</script>ok"),
            "- one\n- two\n\nok",
        )

    def test_attributes_are_dropped_on_recognised_tags(self):
        self.assertEqual(
            strip_migration.html_to_plain_text('<p style="color:red">hi <a href="http://x">link</a></p>'),
            "hi link",
        )

    def test_plain_text_with_angle_brackets_is_unchanged(self):
        for text in (
            "if x<y and y>z",
            "a <b and c> d",
            "Temp < 5 and rain > 2",
            "text <div",
            "<script>alert(1) is never closed, keep all of this",
        ):
            self.assertEqual(strip_migration.html_to_plain_text(text), text)

    def test_none_and_empty(self):
        self.assertIsNone(strip_migration.html_to_plain_text(None))
        self.assertEqual(strip_migration.html_to_plain_text(""), "")

    def test_long_runs_of_spaces_are_fast(self):
        start = time.monotonic()
        result = strip_migration.html_to_plain_text("a" + " " * 200000 + "\nb <script>" * 5000)
        self.assertLess(time.monotonic() - start, 1.0)
        self.assertTrue(result.startswith("a\nb"))


class StripHtmlDataMigrationTests(TestCase):
    def test_migration_rewrites_stored_html(self):
        equipment_type = EquipmentType.objects.create(
            name="Thermometer", description="d", report_template="<p>Check <strong>probe</strong></p><p>Log it</p>"
        )
        strip_migration.strip_html(apps, None)
        equipment_type.refresh_from_db()
        self.assertEqual(equipment_type.report_template, "Check probe\n\nLog it")


class StoredTextIsInertTests(SimpleTestCase):
    def test_template_syntax_in_stored_text_is_literal_and_inert(self):
        html = render_to_string(
            "wx/maintenance_reports/view_report.html",
            {
                "visit_summary_information": {
                    "station_on_arrival_conditions": "[[ 1+1 ]] {{ 1+1 }}",
                    "current_visit_summary": "[[ _openBlock.constructor('x')() ]]",
                    "next_visit_summary": "n",
                    "responsible_technician": "[[ 2+2 ]]",
                },
                "contact_information": "[[ 3+3 ]] {{ 3+3 }}",
                "station_information": {"station_name": "[[ 4+4 ]]"},
                "equipment_records": [{"condition": "[[ 5+5 ]]", "name": "n"}],
            },
        )
        # Django does not evaluate {{ }} in data, and Vue is told not to compile it.
        self.assertIn('<span v-pre>[[ 1+1 ]] {{ 1+1 }}</span>', html)
        self.assertIn("<span v-pre>[[ _openBlock.constructor(&#x27;x&#x27;)() ]]</span>", html)
        self.assertIn('<span v-pre>[[ 2+2 ]]</span>', html)
        self.assertIn('class="contact-box" v-pre>[[ 3+3 ]] {{ 3+3 }}</div>', html)
        self.assertIn('v-pre>[[ 4+4 ]]</div>', html)
        # Equipment records travel as JSON data, not as a Vue expression.
        self.assertIn('<script id="equipment-records-data" type="application/json">', html)
        self.assertIn('v-for="equipment_record in equipment_records"', html)
