from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("encounters", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="encounter",
            name="phase",
            field=models.CharField(
                choices=[("triage", "Triage"), ("consultation", "Consultation")],
                default="consultation",
                max_length=20,
            ),
        ),
    ]
