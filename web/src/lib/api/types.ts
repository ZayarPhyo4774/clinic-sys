export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Tokens = {
  access: string;
  refresh: string;
};

export type AssignedBranch = {
  id: string;
  name: string;
  code: string;
};

export type Account = {
  id: string;
  email: string;
  full_name: string;
  clinic_id: string | null;
  clinic_timezone?: string | null;
  is_superuser: boolean;
  permissions: string[];
  has_role_assignments: boolean;
  requires_branch_selection: boolean;
  access_block_reason: "no_role" | "branch_required" | "role_empty" | null;
  resolved_branch_id: string | null;
  assigned_branches: AssignedBranch[];
};

export type Patient = {
  id: string;
  patient_number: string;
  clinic: string;
  branch: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  is_active: boolean;
  version: number;
  created_at: string;
};

export type Appointment = {
  id: string;
  branch: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  visit_reason: string;
};

export type WalkInResult = {
  appointment: Appointment;
  queue_entry: QueueEntry;
};

export type QueueEntry = {
  id: string;
  appointment: string;
  appointment_status: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  service_date: string;
  position: number;
  status: string;
};

export type Encounter = {
  id: string;
  appointment: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  status: string;
  started_at: string;
  completed_at: string | null;
};

export type Prescription = {
  id: string;
  encounter: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  status: string;
  created_at: string;
};

export type Medicine = {
  id: string;
  category: string;
  name: string;
  code: string;
  form: string;
  strength: string;
  unit: string;
  reorder_level: number;
  available_quantity: number;
  is_active: boolean;
};

export type MedicineCategory = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type LabOrder = {
  id: string;
  encounter: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  status: string;
  reported_at: string | null;
  created_at: string;
};

export type Branch = {
  id: string;
  clinic: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type Department = {
  id: string;
  clinic: string;
  branch: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type Staff = {
  id: string;
  user: string;
  user_email: string;
  user_full_name: string;
  clinic: string;
  branch: string;
  department: string | null;
  staff_type: string;
  job_title: string;
  is_active: boolean;
};

export type DoctorProfile = {
  id: string;
  staff: string;
  clinic: string;
  branch: string;
  staff_full_name?: string;
  staff_email?: string;
  license_number: string;
  specialty: string;
};

export type NurseProfile = {
  id: string;
  staff: string;
  clinic: string;
  branch: string;
  license_number: string;
  grade: string;
};

export type DoctorSchedule = {
  id: string;
  clinic: string;
  branch: string;
  doctor: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  effective_from: string | null;
  effective_until: string | null;
  is_active: boolean;
};

export type PaymentMethod = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type Clinic = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  currency: string;
  locale: string;
  is_active: boolean;
};

export type PatientContact = {
  id: string;
  kind: string;
  name: string;
  value: string;
  is_primary: boolean;
};

export type PatientAddress = {
  id: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  is_primary: boolean;
};

export type PatientAllergy = {
  id: string;
  substance: string;
  reaction: string;
  severity: string;
  status: string;
  recorded_at: string;
};

export type PatientMedicalHistory = {
  id: string;
  title: string;
  details: string;
  onset_date: string | null;
  status: string;
  recorded_at: string;
};

export type PatientProfile = {
  patient: Patient;
  contacts: PatientContact[];
  addresses: PatientAddress[];
  allergies: PatientAllergy[];
  medical_history: PatientMedicalHistory[];
  documents: { id: string; title: string; document_type: string; file_name: string }[];
};

export type VitalUnitFieldName =
  | "temperature"
  | "pulse"
  | "respiratory_rate"
  | "systolic"
  | "diastolic"
  | "spo2"
  | "weight_kg"
  | "height_cm";

export type VitalUnitField = {
  field: VitalUnitFieldName;
  label: string;
  short_label: string;
  unit: string;
  input_mode: "decimal" | "numeric";
  group?: "blood_pressure";
};

export type VitalUnitsResponse = {
  fields: VitalUnitField[];
};

export type EncounterHistory = {
  encounter: Encounter & {
    clinic: string;
    branch: string;
    doctor_full_name?: string;
    started_by: string | null;
    completed_by: string | null;
    created_at: string;
    updated_at: string;
  };
  vitals: {
    id: string;
    temperature: string | null;
    pulse: number | null;
    respiratory_rate: number | null;
    systolic: number | null;
    diastolic: number | null;
    spo2: number | null;
    weight_kg: string | null;
    height_cm: string | null;
    recorded_at: string;
  }[];
  symptoms: { id: string; description: string; recorded_at: string }[];
  diagnoses: { id: string; code: string; description: string; recorded_at: string }[];
  notes: { id: string; body: string; recorded_at: string }[];
  treatment_plans: { id: string; title: string; details: string; recorded_at: string }[];
  follow_ups: { id: string; follow_up_on: string; note: string; recorded_at: string }[];
};

export type PrescriptionItem = {
  id: string;
  medicine: string;
  medicine_unit?: string;
  quantity: string;
  quantity_dispensed: string;
  dosage: string;
  frequency: string;
  duration_days: number;
};

export type MedicineBatch = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity_on_hand: string;
  is_active: boolean;
};

export type StockTransaction = {
  id: string;
  kind: string;
  direction: string;
  quantity: number;
  reason: string;
  recorded_at: string;
  batch: string;
  batch_number?: string;
  medicine: string;
  medicine_name?: string;
  quantity_on_hand?: number;
  prescription_item: string | null;
  recorded_by: string | null;
};

export type LabTest = {
  id: string;
  name: string;
  code: string;
  specimen: string;
  unit: string;
  reference_low: string | null;
  reference_high: string | null;
  reference_text: string;
  is_active: boolean;
};

export type LabOrderItem = {
  id: string;
  lab_test: string;
};

export type LabResult = {
  id: string;
  value: string;
  unit: string;
  reference_low: string | null;
  reference_high: string | null;
  reference_text: string;
  interpretation: string;
  status: string;
  recorded_at: string;
  verified_at: string | null;
};

export type Invoice = {
  id: string;
  patient: string;
  patient_full_name?: string;
  doctor: string;
  doctor_full_name?: string;
  encounter: string | null;
  invoice_number: string;
  currency: string;
  status: string;
  subtotal: string;
  discount_total: string;
  tax_amount: string;
  total: string;
  balance: string;
  issued_at: string | null;
  created_at: string;
  items: InvoiceItem[];
};

export type InvoiceItem = {
  id: string;
  kind: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  line_total?: string;
};

export type Payment = {
  id: string;
  method: string;
  method_name?: string;
  amount: string;
  paid_at: string;
};
