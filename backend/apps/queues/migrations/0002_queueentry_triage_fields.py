from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("queues", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="queueentry",
            name="triage_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="queueentry",
            name="vitals_recorded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
