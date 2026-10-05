"""Load demo clinic data for local development."""

from datetime import date, time

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.default_roles import ensure_permission_catalog, install_default_roles
from apps.accounts.models import Role, User, UserRole
from apps.appointments.models import DoctorSchedule
from apps.billing.models import PaymentMethod
from apps.clinics.ccr_services import ensure_ccr_settings, ensure_default_disability_types
from apps.clinics.models import Branch, Clinic, Staff
from apps.clinics.services import ensure_doctor_profile
from apps.patients.models import Patient, PatientNumberSequence
from apps.pharmacy.seed import seed_pharmacy
from testing import PASSWORD

DEMO_PASSWORD = PASSWORD
CLINIC_CODE = "demo"
BRANCH_CODE = "main"
OPERATOR_EMAIL = "operator@demo.local"
DOCTOR_EMAIL = "doctor@demo.local"
RECEPTION_EMAIL = "reception@demo.local"


class Command(BaseCommand):
    help = "Seed the database with a demo clinic, users, schedules, and sample data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            help="Reset demo user passwords to the default seed password.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        reset_passwords = options["reset_passwords"]

        operator = self._ensure_user(
            email=OPERATOR_EMAIL,
            full_name="Demo Operator",
            password=DEMO_PASSWORD,
            clinic=None,
            is_superuser=True,
            is_staff=True,
            reset_password=reset_passwords,
        )

        clinic, _ = Clinic.objects.get_or_create(
            code=CLINIC_CODE,
            defaults={
                "name": "Demo Clinic",
                "timezone": "Asia/Yangon",
                "currency": "MMK",
            },
        )

        branch, _ = Branch.objects.get_or_create(
            clinic=clinic,
            code=BRANCH_CODE,
            defaults={"name": "Main Branch"},
        )

        ensure_default_disability_types(clinic)
        ccr_settings = ensure_ccr_settings(clinic)
        ccr_settings.project_name = "EWARS"
        ccr_settings.state_region = "Magway"
        ccr_settings.township_mimu = "Salin"
        ccr_settings.village_mimu = "Demo Village"
        ccr_settings.consultant_position = "Field Medical Officer"
        ccr_settings.save()

        permissions_created = ensure_permission_catalog()
        role_result = install_default_roles(clinic, update_existing=True)

        doctor = self._ensure_user(
            email=DOCTOR_EMAIL,
            full_name="Dr. Demo",
            password=DEMO_PASSWORD,
            clinic=clinic,
            reset_password=reset_passwords,
        )
        reception = self._ensure_user(
            email=RECEPTION_EMAIL,
            full_name="Rita Reception",
            password=DEMO_PASSWORD,
            clinic=clinic,
            reset_password=reset_passwords,
        )

        doctor_staff, _ = Staff.objects.get_or_create(
            user=doctor,
            branch=branch,
            department=None,
            defaults={
                "staff_type": Staff.StaffType.DOCTOR,
                "job_title": "General Practitioner",
                "created_by": operator,
            },
        )
        if doctor_staff.staff_type != Staff.StaffType.DOCTOR:
            doctor_staff.staff_type = Staff.StaffType.DOCTOR
            doctor_staff.save(update_fields=["staff_type", "updated_at"])

        profile = ensure_doctor_profile(doctor_staff, created_by=operator)
        if profile.specialty != "General practice":
            profile.specialty = "General practice"
            profile.save(update_fields=["specialty", "updated_at"])

        reception_staff, _ = Staff.objects.get_or_create(
            user=reception,
            branch=branch,
            department=None,
            defaults={
                "staff_type": Staff.StaffType.OTHER,
                "job_title": "Receptionist",
                "created_by": operator,
            },
        )

        solo_role = Role.objects.get(clinic=clinic, code="solo-practitioner")
        reception_role = Role.objects.get(clinic=clinic, code="receptionist")

        self._ensure_assignment(doctor, solo_role, branch)
        self._ensure_assignment(reception, reception_role, branch)

        schedules_created = self._ensure_weekday_schedules(
            clinic=clinic,
            branch=branch,
            doctor=profile,
            created_by=operator,
        )

        payment_method, payment_created = PaymentMethod.objects.get_or_create(
            clinic=clinic,
            code="cash",
            defaults={"name": "Cash", "created_by": operator},
        )

        patient, patient_created = Patient.objects.get_or_create(
            clinic=clinic,
            patient_number="000001",
            defaults={
                "branch": branch,
                "full_name": "Aye Aye Patient",
                "date_of_birth": date(1992, 3, 15),
                "sex": Patient.Sex.FEMALE,
                "created_by": operator,
            },
        )
        sequence, _ = PatientNumberSequence.objects.get_or_create(
            clinic=clinic,
            defaults={"last_value": int(patient.patient_number)},
        )
        if sequence.last_value < int(patient.patient_number):
            sequence.last_value = int(patient.patient_number)
            sequence.save(update_fields=["last_value", "updated_at"])

        pharmacy_result = seed_pharmacy(clinic=clinic, branch=branch, created_by=operator)

        self.stdout.write(self.style.SUCCESS("Database seeded successfully."))
        self.stdout.write("")
        self.stdout.write("Clinic: Demo Clinic (demo) · Main Branch (main) · Asia/Yangon")
        self.stdout.write("")
        self.stdout.write("Accounts (password for all: %s)" % DEMO_PASSWORD)
        self.stdout.write("  Operator (superuser): %s" % OPERATOR_EMAIL)
        self.stdout.write("  Solo doctor:          %s" % DOCTOR_EMAIL)
        self.stdout.write("  Receptionist:         %s" % RECEPTION_EMAIL)
        self.stdout.write("")
        self.stdout.write(
            "Created/updated: permissions=%s roles=%s schedules=%s payment_method=%s patient=%s pharmacy=%s"
            % (
                permissions_created,
                role_result,
                schedules_created,
                "yes" if payment_created else "existing",
                "yes" if patient_created else "existing",
                pharmacy_result,
            )
        )
        self.stdout.write("")
        self.stdout.write("Sign in at http://localhost:3000/login and select branch Main Branch in the sidebar.")

    def _ensure_user(
        self,
        *,
        email: str,
        full_name: str,
        password: str,
        clinic: Clinic | None,
        is_superuser: bool = False,
        is_staff: bool = False,
        reset_password: bool = False,
    ) -> User:
        user = User.objects.filter(email=email).first()
        if user is None:
            if is_superuser:
                return User.objects.create_superuser(
                    email=email,
                    password=password,
                    full_name=full_name,
                )
            return User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                clinic=clinic,
            )

        changed = False
        if user.full_name != full_name:
            user.full_name = full_name
            changed = True
        if clinic is not None and user.clinic_id != clinic.id:
            user.clinic = clinic
            changed = True
        if is_superuser and not user.is_superuser:
            user.is_superuser = True
            changed = True
        if is_staff and not user.is_staff:
            user.is_staff = True
            changed = True
        if changed:
            user.save()
        if reset_password:
            user.set_password(password)
            user.save(update_fields=["password"])
        return user

    def _ensure_assignment(self, user: User, role: Role, branch: Branch) -> None:
        UserRole.objects.get_or_create(user=user, role=role, branch=branch)

    def _ensure_weekday_schedules(self, *, clinic, branch, doctor, created_by) -> int:
        created = 0
        for weekday in range(5):
            _schedule, was_created = DoctorSchedule.objects.get_or_create(
                clinic=clinic,
                branch=branch,
                doctor=doctor,
                weekday=weekday,
                defaults={
                    "start_time": time(9, 0),
                    "end_time": time(17, 0),
                    "slot_minutes": 30,
                    "is_active": True,
                    "created_by": created_by,
                },
            )
            if was_created:
                created += 1
        return created
