from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0001_initial"),
        ("prescriptions", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescriptionitem",
            name="source",
            field=models.CharField(
                choices=[("inventory", "Inventory"), ("external", "External")],
                default="inventory",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="prescriptionitem",
            name="medicine_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="prescriptionitem",
            name="medicine",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="prescription_items",
                to="pharmacy.medicine",
            ),
        ),
        migrations.AddConstraint(
            model_name="prescriptionitem",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("source", "inventory"),
                    ("medicine__isnull", False),
                )
                | models.Q(
                    ("source", "external"),
                    ("medicine__isnull", True),
                    ("medicine_name__gt", ""),
                ),
                name="rx_item_source_valid",
            ),
        ),
    ]
