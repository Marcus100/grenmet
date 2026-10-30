import importlib
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

    def test_lists_and_scripts(self):
        self.assertEqual(
            strip_migration.html_to_plain_text("<ul><li>one</li><li>two</li></ul><script>alert(1)</script>ok"),
            "- one\n- two\n\nok",
        )

    def test_plain_text_is_unchanged(self):
        self.assertEqual(strip_migration.html_to_plain_text("Temp < 5 and rain > 2"), "Temp < 5 and rain > 2")
        self.assertIsNone(strip_migration.html_to_plain_text(None))


class StripHtmlDataMigrationTests(TestCase):
    def test_migration_rewrites_stored_html(self):
        equipment_type = EquipmentType.objects.create(
            name="Thermometer", description="d", report_template="<p>Check <strong>probe</strong></p><p>Log it</p>"
        )
        strip_migration.strip_html(apps, None)
        equipment_type.refresh_from_db()
        self.assertEqual(equipment_type.report_template, "Check probe\n\nLog it")
