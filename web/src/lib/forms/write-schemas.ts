import { z } from "zod";

const uuid = (label: string) => z.string().uuid(`Choose a valid ${label}.`);
const name = (label: string) => z.string().trim().min(1, `${label} is required.`);
const code = z.string().trim().min(1, "Code is required.");
const optionalText = z.string().trim();
const positiveInt = z.coerce.number().int().min(1, "Enter a positive quantity.");
const nonNegativeInt = z.coerce.number().int().min(0, "Enter zero or more.");

function optionalVitalInt(min: number, max: number, label: string) {
  return z.string().trim().superRefine((value, context) => {
    if (value === "") {
      return;
    }
    if (!/^\d+$/.test(value)) {
      context.addIssue({ code: "custom", message: `${label} must be a whole number.` });
      return;
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      context.addIssue({
        code: "custom",
        message: `${label} must be between ${min} and ${max}.`,
      });
    }
  });
}

function optionalVitalDecimal(min: number, max: number, label: string) {
  return z.string().trim().superRefine((value, context) => {
    if (value === "") {
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      context.addIssue({ code: "custom", message: `${label} must be a valid number.` });
      return;
    }
    const parsed = Number(value);
    if (parsed < min || parsed > max) {
      context.addIssue({
        code: "custom",
        message: `${label} must be between ${min} and ${max}.`,
      });
    }
  });
}

export const vitalsSchema = z
  .object({
    temperature: optionalVitalDecimal(30, 45, "Temperature"),
    pulse: optionalVitalInt(20, 250, "Pulse"),
    respiratory_rate: optionalVitalInt(5, 80, "Respiratory rate"),
    systolic: optionalVitalInt(50, 250, "Systolic"),
    diastolic: optionalVitalInt(30, 150, "Diastolic"),
    spo2: optionalVitalInt(50, 100, "SpO2"),
    weight_kg: optionalVitalDecimal(0.2, 500, "Weight"),
    height_cm: optionalVitalDecimal(30, 250, "Height"),
  })
  .superRefine((value, context) => {
    const hasValue = Object.values(value).some((item) => item.length > 0);
    if (!hasValue) {
      context.addIssue({ code: "custom", message: "Enter at least one measurement.", path: ["temperature"] });
      return;
    }

    const hasSystolic = value.systolic.length > 0;
    const hasDiastolic = value.diastolic.length > 0;
    if (hasSystolic !== hasDiastolic) {
      context.addIssue({
        code: "custom",
        message: "Record both blood pressure numbers.",
        path: ["systolic"],
      });
      context.addIssue({
        code: "custom",
        message: "Record both blood pressure numbers.",
        path: ["diastolic"],
      });
      return;
    }

    if (hasSystolic && hasDiastolic) {
      const systolic = Number(value.systolic);
      const diastolic = Number(value.diastolic);
      if (systolic <= diastolic) {
        context.addIssue({
          code: "custom",
          message: "Systolic must be higher than diastolic.",
          path: ["systolic"],
        });
      }
    }
  });

export type VitalsFormValues = z.infer<typeof vitalsSchema>;

export function buildVitalsBody(data: VitalsFormValues) {
  const body: Record<string, string | number> = {};
  if (data.temperature) body.temperature = data.temperature;
  if (data.pulse) body.pulse = Number(data.pulse);
  if (data.respiratory_rate) body.respiratory_rate = Number(data.respiratory_rate);
  if (data.systolic) body.systolic = Number(data.systolic);
  if (data.diastolic) body.diastolic = Number(data.diastolic);
  if (data.spo2) body.spo2 = Number(data.spo2);
  if (data.weight_kg) body.weight_kg = data.weight_kg;
  if (data.height_cm) body.height_cm = data.height_cm;
  return body;
}

export const clinicalNoteSchema = z.object({
  body: z.string().trim().min(1, "Enter a note."),
});

export const symptomSchema = z.object({
  description: name("Description"),
});

export const diagnosisSchema = z.object({
  code: code,
  description: name("Description"),
});

export const treatmentPlanSchema = z.object({
  title: name("Title"),
  details: name("Details"),
});

export const followUpSchema = z.object({
  follow_up_on: z.string().min(1, "Choose a follow-up date."),
  note: optionalText,
});

export const prescriptionItemSchema = z.object({
  medicine: uuid("medicine"),
  quantity: positiveInt,
  dosage: name("Dosage"),
  frequency: optionalText,
  duration_days: z.coerce.number().int().min(1).nullable().optional(),
});

export const labOrderCreateSchema = z.object({
  lab_test: uuid("lab test"),
});

export const medicineCreateSchema = z.object({
  category: uuid("category"),
  name: name("Name"),
  code: code,
  form: name("Form"),
  strength: name("Strength"),
  unit: name("Unit"),
  reorder_level: nonNegativeInt,
});

export const medicineEditSchema = z.object({
  category: uuid("category"),
  name: name("Name"),
  form: name("Form"),
  strength: name("Strength"),
  unit: name("Unit"),
  reorder_level: nonNegativeInt,
  is_active: z.boolean(),
});

export const receiveStockSchema = z.object({
  batch_number: name("Batch number"),
  expiry_date: z.string().min(1, "Expiry date is required."),
  initial_quantity: positiveInt,
  supplier: z.union([z.string().uuid(), z.literal("")]).optional(),
});

export const stockAdjustmentReasons = [
  "damaged",
  "expired",
  "count_correction",
  "other",
] as const;

export const stockOutReasons = ["damaged", "expired", "other"] as const;

export const addStockToBatchSchema = z.object({
  batch: uuid("batch"),
  quantity: positiveInt,
});

export const stockOutSchema = z.object({
  batch: uuid("batch"),
  quantity: positiveInt,
  reason: z.enum(stockOutReasons, { message: "Choose a reason." }),
});

export const adjustStockSchema = z.object({
  batch: uuid("batch"),
  direction: z.enum(["in", "out"]),
  quantity: positiveInt,
  reason: z.enum(stockAdjustmentReasons, { message: "Choose a reason." }),
});

export const catalogCreateSchema = z.object({
  name: name("Name"),
  code: code,
});

export const catalogRenameSchema = z.object({
  itemId: uuid("item"),
  name: name("Name"),
});

export const manualInvoiceSchema = z.object({
  patient: z.string().trim().min(1, "Choose a patient.").uuid("Choose a patient."),
  doctor: z.string().trim().min(1, "Choose a doctor.").uuid("Choose a doctor."),
});

export const invoiceLineSchema = z
  .object({
    kind: z.enum(["consultation", "pharmacy", "laboratory"]),
    description: z.string().trim().max(50, "Description is too long.").optional(),
    quantity: positiveInt,
    unit_price: z.coerce.number().positive("Enter a unit price greater than zero."),
    discount_amount: z.coerce.number().min(0).optional(),
    prescription_item: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "pharmacy" && !value.prescription_item) {
      context.addIssue({
        code: "custom",
        message: "Choose a dispensed prescription item.",
        path: ["prescription_item"],
      });
    }
  });

export const recordPaymentSchema = z.object({
  method: uuid("payment method"),
  amount: z.coerce.number().positive("Enter a payment amount."),
});

export const paymentMethodSchema = z.object({
  name: name("Name"),
  code: code,
});

export const patientDemographicsSchema = z.object({
  full_name: name("Full name"),
  date_of_birth: z.string().min(1, "Date of birth is required."),
  sex: z.string().min(1, "Sex is required."),
});

export const contactSchema = z.object({
  kind: name("Kind"),
  value: name("Value"),
  is_primary: z.boolean().optional(),
});

export const addressSchema = z.object({
  label: optionalText,
  line1: name("Address line"),
  line2: optionalText,
  city: name("City"),
  region: optionalText,
  postal_code: optionalText,
  country: name("Country"),
});

export const addressEditSchema = addressSchema.extend({
  addressId: uuid("address"),
});

export const contactEditSchema = contactSchema.extend({
  contactId: uuid("contact"),
});

export const allergySchema = z.object({
  substance: name("Substance"),
  reaction: optionalText,
  severity: optionalText,
});

export const allergyCorrectSchema = allergySchema.extend({
  supersedes: uuid("allergy"),
});

export const historySchema = z.object({
  title: name("Title"),
  details: optionalText,
});

export const historyCorrectSchema = historySchema.extend({
  supersedes: uuid("entry"),
});

export const documentSchema = z.object({
  title: name("Title"),
  document_type: name("Document type"),
});

export const documentCreateSchema = documentSchema.extend({
  file_name: name("File name"),
  storage_key: name("Storage key"),
});

export const documentEditSchema = documentSchema.extend({
  documentId: uuid("document"),
  file_name: name("File name"),
});

export const labResultSchema = z.object({
  value: name("Value"),
});

export const labTestCreateSchema = z.object({
  name: name("Name"),
  code: code,
  specimen: name("Specimen"),
  unit: name("Unit"),
  reference_low: optionalText,
  reference_high: optionalText,
  reference_text: optionalText,
});

export const labTestEditSchema = z.object({
  name: name("Name"),
  specimen: name("Specimen"),
  unit: name("Unit"),
  reference_low: optionalText,
  reference_high: optionalText,
  reference_text: optionalText,
});

export const rescheduleSchema = z
  .object({
    starts_at: z.string().min(1, "Start time is required."),
    ends_at: z.string().min(1, "End time is required."),
  })
  .superRefine((value, context) => {
    const starts = new Date(value.starts_at);
    const ends = new Date(value.ends_at);
    if (Number.isNaN(starts.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid start time.", path: ["starts_at"] });
      return;
    }
    if (Number.isNaN(ends.getTime())) {
      context.addIssue({ code: "custom", message: "Enter a valid end time.", path: ["ends_at"] });
      return;
    }
    if (ends <= starts) {
      context.addIssue({ code: "custom", message: "End time must be after start time.", path: ["ends_at"] });
    }
  });

export const adminUserCreateSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  full_name: name("Full name"),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const adminUserNameSchema = z.object({
  userId: uuid("user"),
  full_name: name("Full name"),
});

export const adminRoleCreateSchema = z.object({
  name: name("Name"),
  code: code,
  permissions: z.array(z.string()).min(1, "Choose at least one permission."),
});

export const adminRoleUpdateSchema = z.object({
  roleId: uuid("role"),
  name: name("Name"),
  permissions: z.array(z.string()).min(1, "Choose at least one permission."),
});

export const adminAssignmentSchema = z.object({
  user: uuid("user"),
  role: uuid("role"),
  branch: z.union([z.string().uuid(), z.literal(""), z.literal("__none__")]).optional(),
});

export const orgCreateSchema = z.object({
  name: name("Name"),
  code: code,
});

export const departmentCreateSchema = z.object({
  branch: uuid("branch"),
  name: name("Name"),
  code: code,
});

export const staffLinkSchema = z.object({
  user: uuid("user"),
  branch: uuid("branch"),
  staff_type: z.enum(["doctor", "nurse", "other"]),
});

export const staffUpdateSchema = z.object({
  job_title: z.string().trim().optional(),
  department: z.string().optional(),
});

export const doctorProfileSchema = z.object({
  license_number: z.string().trim().min(1, "License number is required."),
  specialty: z.string().trim().min(1, "Specialty is required."),
});

export const nurseProfileSchema = z.object({
  license_number: z.string().trim().min(1, "License number is required."),
  grade: z.string().trim().optional(),
});

export const scheduleCreateSchema = z.object({
  doctor: uuid("doctor"),
  branch: uuid("branch"),
  weekday: z.coerce.number().int().min(0).max(6),
  start_time: z.string().min(1, "Start time is required."),
  end_time: z.string().min(1, "End time is required."),
  slot_minutes: positiveInt.optional(),
});

export const clinicUpdateSchema = z.object({
  name: name("Name"),
  timezone: name("Timezone"),
  currency: name("Currency"),
  locale: name("Locale"),
});
