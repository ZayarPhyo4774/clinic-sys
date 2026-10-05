import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0003_ccr_settings"),
        ("encounters", "0002_encounter_phase"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="EncounterConsultationMeta",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "patient_status",
                    models.CharField(
                        blank=True,
                        choices=[("new", "New"), ("old", "Old")],
                        max_length=10,
                    ),
                ),
                ("is_plw", models.BooleanField(default=False)),
                ("is_disabled", models.BooleanField(default=False)),
                ("referral_made", models.BooleanField(default=False)),
                ("referral_cause", models.TextField(blank=True)),
                ("treatment", models.TextField(blank=True)),
                ("remark", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "disability_type",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="consultation_entries",
                        to="clinics.clinicdisabilitytype",
                    ),
                ),
                (
                    "encounter",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="consultation_meta",
                        to="encounters.encounter",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="updated_consultation_meta",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
