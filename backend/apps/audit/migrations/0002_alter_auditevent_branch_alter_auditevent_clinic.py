from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0001_initial"),
        ("clinics", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="auditevent",
            name="branch",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="audit_events",
                to="clinics.branch",
            ),
        ),
        migrations.AlterField(
            model_name="auditevent",
            name="clinic",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="audit_events",
                to="clinics.clinic",
            ),
        ),
    ]
