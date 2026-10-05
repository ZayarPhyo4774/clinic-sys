import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0002_branch_created_by_clinic_created_by_department_staff_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClinicDisabilityType",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("label", models.CharField(max_length=200)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "clinic",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="disability_types",
                        to="clinics.clinic",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "label"],
            },
        ),
        migrations.CreateModel(
            name="ClinicCcrSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("project_name", models.CharField(blank=True, max_length=200)),
                ("state_region", models.CharField(blank=True, max_length=200)),
                ("township_mimu", models.CharField(blank=True, max_length=200)),
                ("village_mimu", models.CharField(blank=True, max_length=200)),
                (
                    "population_type",
                    models.CharField(
                        blank=True,
                        choices=[("host", "Host"), ("idps", "IDPs")],
                        max_length=20,
                    ),
                ),
                (
                    "idp_location",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("forest", "Forest"),
                            ("monastery", "Monastery"),
                            ("school", "School"),
                            ("other", "Other"),
                        ],
                        max_length=20,
                    ),
                ),
                ("consultant_name", models.CharField(blank=True, max_length=200)),
                ("consultant_position", models.CharField(blank=True, max_length=200)),
                ("required_fields", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "clinic",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ccr_settings",
                        to="clinics.clinic",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="clinicdisabilitytype",
            constraint=models.UniqueConstraint(fields=("clinic", "label"), name="uniq_disability_label_per_clinic"),
        ),
    ]
