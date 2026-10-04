from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.clinics.models import Branch, Clinic
from apps.pharmacy.seed import DEMO_BRANCH_CODE, DEMO_CLINIC_CODE, seed_pharmacy


class Command(BaseCommand):
    help = "Seed demo pharmacy catalog and stock for the demo clinic."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clinic",
            default=DEMO_CLINIC_CODE,
            help="Clinic code to seed (default: demo).",
        )
        parser.add_argument(
            "--branch",
            default=DEMO_BRANCH_CODE,
            help="Branch code to seed (default: main).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        clinic_code = options["clinic"]
        branch_code = options["branch"]

        try:
            clinic = Clinic.objects.get(code=clinic_code)
        except Clinic.DoesNotExist as exc:
            raise CommandError(f'Clinic "{clinic_code}" not found. Run seed_database first.') from exc

        try:
            branch = Branch.objects.get(clinic=clinic, code=branch_code)
        except Branch.DoesNotExist as exc:
            raise CommandError(f'Branch "{branch_code}" not found for clinic "{clinic_code}".') from exc

        created_by = User.objects.filter(is_superuser=True).order_by("date_joined").first()
        if created_by is None:
            raise CommandError("No superuser found. Run seed_database first.")

        result = seed_pharmacy(clinic=clinic, branch=branch, created_by=created_by)

        self.stdout.write(self.style.SUCCESS("Pharmacy seeded successfully."))
        self.stdout.write("")
        self.stdout.write("Clinic: %s (%s) · Branch: %s (%s)" % (clinic.name, clinic.code, branch.name, branch.code))
        self.stdout.write("")
        self.stdout.write("Catalog:")
        self.stdout.write("  4 categories · 5 medicines · 1 supplier (demo-supply)")
        self.stdout.write("")
        self.stdout.write(
            "Created: supplier=%s categories=%s medicines=%s batches=%s units_received=%s"
            % (
                "yes" if result["supplier_created"] else "existing",
                result["categories_created"],
                result["medicines_created"],
                result["batches_created"],
                result["stock_received"],
            )
        )
        self.stdout.write("")
        self.stdout.write("Open Pharmacy in the app to dispense from stocked batches.")
