from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("patients", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="dob_is_approximate",
            field=models.BooleanField(default=False),
        ),
    ]
