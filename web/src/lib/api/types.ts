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
  inventory_role?: "store" | "dispensary" | "both";
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
  dob_is_approximate: boolean;
  age: number;
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
  encounter: string | null;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  service_date: string;
  position: number;
  status: string;
  triage_started_at: string | null;
  vitals_recorded_at: string | null;
};

export type TriageStartResult = {
  queue_entry: QueueEntry;
  encounter: Encounter;
};

export type Encounter = {
  id: string;
  appointment: string;
  patient: string;
  doctor: string;
  doctor_full_name?: string;
  status: string;
  phase: "triage" | "consultation";
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

export type MedicineBulkImportResult = {
  created: number;
  skipped: number;
  categories_created: number;
  errors: Array<{ row: number; code?: string | null; message: string }>;
};

export type BulkStockReceiveResult = {
  created: number;
  updated: number;
  reference_number: string;
  errors: Array<{ row: number; medicine_code?: string | null; message: string }>;
};

export type GoodsReceiptLine = {
  id: string;
  medicine: string;
  medicine_name: string;
  medicine_code: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  batch_id: string | null;
};

export type GoodsReceiptNote = {
  id: string;
  branch: string;
  branch_name: string;
  supplier: string | null;
  supplier_name: string;
  reference_number: string;
  received_at: string;
  status: "draft" | "posted" | "cancelled";
  notes: string;
  lines: GoodsReceiptLine[];
  line_count: number;
  posted_at: string | null;
};

export type PharmacyLedgerRow = {
  medicine_id: string;
  medicine_code: string;
  medicine_name: string;
  strength: string;
  category: string;
  unit: string;
  opening_balance: number;
  received: number;
  used: number;
  adjustment_in: number;
  adjustment_out: number;
  transfer_in: number;
  transfer_out: number;
  remaining_balance: number;
  reorder_level: number;
  status: "out_of_stock" | "low_stock" | "in_stock";
  batch_count: number;
  nearest_expiry: string | null;
};

export type PharmacyReport = {
  from: string;
  to: string;
  medicines_tracked: number;
  total_units_on_hand: number;
  total_used: number;
  low_stock_count: number;
  low_stock_items: Array<{
    medicine_id: string;
    medicine_code: string;
    medicine_name: string;
    quantity_on_hand: number;
    reorder_level: number;
    used?: number;
    status?: string;
  }>;
  expiring_within_30_days: number;
  expiring_within_60_days: number;
  expiring_within_90_days: number;
  dispense_by_medicine: Array<{ medicine_id: string; code: string; name: string; units: number }>;
  movement_summary: {
    stock_in_units: number;
    dispense_units: number;
    used_units: number;
    adjustment_units: number;
    adjustment_in_units: number;
    adjustment_out_units: number;
    transfer_in_units: number;
    transfer_out_units: number;
  };
  adjustments_by_reason: Record<string, number>;
  inventory_by_role: Record<
    string,
    {
      label: string;
      units_on_hand: number;
      batch_count: number;
    }
  >;
  inventory_ledger: PharmacyLedgerRow[];
  ledger_totals: {
    opening_balance: number;
    received: number;
    used: number;
    adjustment_in: number;
    adjustment_out: number;
    transfer_in: number;
    transfer_out: number;
    remaining_balance: number;
  };
  movement_lines: Array<{
    recorded_at: string;
    medicine_code: string;
    medicine_name: string;
    batch_number: string;
    branch_name: string;
    kind: string;
    kind_label: string;
    direction: string;
    quantity: number;
    signed_quantity: number;
    reason: string;
    recorded_by: string;
  }>;
  on_hand_by_medicine: Array<{
    medicine_id: string;
    medicine_code: string;
    medicine_name: string;
    unit: string;
    quantity_on_hand: number;
    reorder_level: number;
    batch_count: number;
    nearest_expiry: string | null;
  }>;
  batch_register: Array<{
    batch_id: string;
    batch_number: string;
    medicine_code: string;
    medicine_name: string;
    branch_name: string;
    branch_role: string;
    quantity_on_hand: number;
    expiry_date: string;
    supplier_name: string;
  }>;
};

/** @deprecated Use PharmacyReport */
export type PharmacyInventoryReport = PharmacyReport;

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

export type ClinicDisabilityType = {
  id: string;
  clinic: string;
  sort_order: number;
  label: string;
  is_active: boolean;
};

export type ClinicCcrSettings = {
  project_name: string;
  state_region: string;
  township_mimu: string;
  village_mimu: string;
  population_type: "" | "host" | "idps";
  idp_location: "" | "forest" | "monastery" | "school" | "other";
  consultant_name: string;
  consultant_position: string;
  required_fields: string[];
  required_field_choices: string[];
  updated_at: string;
};

export type EncounterConsultationMeta = {
  patient_status: "" | "new" | "old";
  suggested_patient_status: "new" | "old";
  is_plw: boolean;
  is_disabled: boolean;
  disability_type: string | null;
  disability_type_label?: string | null;
  referral_made: boolean;
  referral_cause: string;
  treatment: string;
  remark: string;
  required_fields: string[];
  updated_at: string;
};

export type CcrReportRow = {
  no: number;
  name: string;
  age: string;
  gender: string;
  diagnosis: string;
  treatment: string;
  plw: string;
  disabled: string;
  disability_type_number: string;
  status_old: string;
  status_new: string;
  referral: string;
  referral_cause: string;
  remark: string;
};

export type CcrReport = {
  header: {
    title: string;
    project_name: string;
    state_region: string;
    township_mimu: string;
    village_mimu: string;
    population_type: string;
    idp_location: string;
    consultant_name: string;
    consultant_position: string;
    from: string;
    to: string;
    report_date: string;
    report_date_formatted: string;
  };
  rows: CcrReportRow[];
  disability_types: Array<{ sort_order: number; label: string }>;
  row_count: number;
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
  options?: Partial<Record<VitalUnitFieldName, string[]>>;
  defaults?: Partial<Record<VitalUnitFieldName, string>>;
};

export type ClinicVitalSettings = {
  units: Partial<Record<VitalUnitFieldName, string>>;
  configured_units: Partial<Record<VitalUnitFieldName, string>>;
  options: Partial<Record<VitalUnitFieldName, string[]>>;
  defaults: Partial<Record<VitalUnitFieldName, string>>;
};

export type EncounterHistory = {
  consultation_meta?: EncounterConsultationMeta;
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
  source: "inventory" | "external";
  medicine: string | null;
  medicine_name?: string;
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
