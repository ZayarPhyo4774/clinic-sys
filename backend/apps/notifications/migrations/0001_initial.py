import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("clinics", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=200)),
                ("message", models.TextField(blank=True)),
                (
                    "kind",
                    models.CharField(
                        choices=[("info", "Info"), ("alert", "Alert"), ("assignment", "Assignment")],
                        default="info",
                        max_length=20,
                    ),
                ),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "branch",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="notifications",
                        to="clinics.branch",
                    ),
                ),
                (
                    "clinic",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="notifications",
                        to="clinics.clinic",
                    ),
                ),
                (
                    "recipient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["recipient", "read_at"], name="notif_recipient_read_idx"),
                    models.Index(fields=["clinic", "created_at"], name="notif_clinic_created_idx"),
                ],
            },
        ),
    ]
