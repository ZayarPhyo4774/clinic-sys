from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0002_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="invoice",
            name="encounter",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="invoices",
                to="encounters.encounter",
            ),
        ),
    ]
