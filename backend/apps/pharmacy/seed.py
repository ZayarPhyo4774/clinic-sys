"""Demo pharmacy catalog and stock for local development."""

from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from apps.clinics.models import Branch, Clinic
from apps.pharmacy.models import Medicine, MedicineBatch, MedicineCategory, StockTransaction, Supplier
from apps.pharmacy.services import apply_stock

DEMO_CLINIC_CODE = "demo"
DEMO_BRANCH_CODE = "main"


@dataclass(frozen=True)
class CategorySeed:
    code: str
    name: str


@dataclass(frozen=True)
class MedicineSeed:
    code: str
    name: str
    category_code: str
    form: str
    strength: str
    unit: str
    reorder_level: int
    batch_number: str
    initial_quantity: int


CATEGORY_SEEDS: tuple[CategorySeed, ...] = (
    CategorySeed("analgesics", "Analgesics"),
    CategorySeed("antibiotics", "Antibiotics"),
    CategorySeed("antacids", "Antacids"),
    CategorySeed("diabetes", "Diabetes"),
)

MEDICINE_SEEDS: tuple[MedicineSeed, ...] = (
    MedicineSeed(
        "paracetamol-500",
        "Paracetamol",
        "analgesics",
        Medicine.Form.TABLET,
        "500mg",
        Medicine.Unit.TABLET,
        50,
        "DEMO-PAR-001",
        200,
    ),
    MedicineSeed(
        "ibuprofen-400",
        "Ibuprofen",
        "analgesics",
        Medicine.Form.TABLET,
        "400mg",
        Medicine.Unit.TABLET,
        30,
        "DEMO-IBU-001",
        120,
    ),
    MedicineSeed(
        "amoxicillin-500",
        "Amoxicillin",
        "antibiotics",
        Medicine.Form.CAPSULE,
        "500mg",
        Medicine.Unit.CAPSULE,
        40,
        "DEMO-AMX-001",
        100,
    ),
    MedicineSeed(
        "omeprazole-20",
        "Omeprazole",
        "antacids",
        Medicine.Form.CAPSULE,
        "20mg",
        Medicine.Unit.CAPSULE,
        20,
        "DEMO-OME-001",
        60,
    ),
    MedicineSeed(
        "metformin-500",
        "Metformin",
        "diabetes",
        Medicine.Form.TABLET,
        "500mg",
        Medicine.Unit.TABLET,
        25,
        "DEMO-MET-001",
        80,
    ),
)


def seed_pharmacy(*, clinic: Clinic, branch: Branch, created_by) -> dict[str, int]:
    """Create demo categories, medicines, supplier, and stocked batches."""
    supplier, supplier_created = Supplier.objects.get_or_create(
        clinic=clinic,
        code="demo-supply",
        defaults={"name": "Demo Medical Supply", "created_by": created_by},
    )

    categories_created = 0
    category_map: dict[str, MedicineCategory] = {}
    for row in CATEGORY_SEEDS:
        category, created = MedicineCategory.objects.get_or_create(
            clinic=clinic,
            code=row.code,
            defaults={"name": row.name, "created_by": created_by},
        )
        category_map[row.code] = category
        if created:
            categories_created += 1

    medicines_created = 0
    batches_created = 0
    stock_received = 0
    expiry_date = timezone.now().date() + timedelta(days=365)

    for row in MEDICINE_SEEDS:
        category = category_map[row.category_code]
        medicine, medicine_created = Medicine.objects.get_or_create(
            clinic=clinic,
            code=row.code,
            defaults={
                "category": category,
                "name": row.name,
                "form": row.form,
                "strength": row.strength,
                "unit": row.unit,
                "reorder_level": row.reorder_level,
                "created_by": created_by,
            },
        )
        if medicine_created:
            medicines_created += 1

        batch, batch_created = MedicineBatch.objects.get_or_create(
            branch=branch,
            medicine=medicine,
            batch_number=row.batch_number,
            defaults={
                "supplier": supplier,
                "expiry_date": expiry_date,
                "created_by": created_by,
            },
        )
        if batch_created:
            batches_created += 1
            if row.initial_quantity > 0:
                apply_stock(
                    batch=batch,
                    kind=StockTransaction.Kind.STOCK_IN,
                    direction=StockTransaction.Direction.IN,
                    quantity=row.initial_quantity,
                    user=created_by,
                )
                stock_received += row.initial_quantity

    return {
        "supplier_created": int(supplier_created),
        "categories_created": categories_created,
        "medicines_created": medicines_created,
        "batches_created": batches_created,
        "stock_received": stock_received,
    }


def seed_demo_pharmacy(created_by) -> dict[str, int]:
    clinic = Clinic.objects.get(code=DEMO_CLINIC_CODE)
    branch = Branch.objects.get(clinic=clinic, code=DEMO_BRANCH_CODE)
    return seed_pharmacy(clinic=clinic, branch=branch, created_by=created_by)
