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

export type Account = {
  id: string;
  email: string;
  full_name: string;
  clinic_id: string | null;
  permissions: string[];
};

export type StaffRecord = {
  id: string;
  user: string;
  staff_type: string;
  is_active: boolean;
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type Patient = {
  id: string;
  patient_number: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  is_active: boolean;
};

export type Appointment = {
  id: string;
  patient: string;
  doctor: string;
  starts_at: string;
  ends_at: string;
  status: string;
  visit_reason: string;
};

export type QueueEntry = {
  id: string;
  patient: string;
  doctor: string;
  service_date: string;
  position: number;
  status: string;
  appointment_status: string;
};

export type Encounter = {
  id: string;
  patient: string;
  doctor: string;
  status: string;
  started_at: string;
};

export type Prescription = {
  id: string;
  patient: string;
  doctor: string;
  status: string;
  created_at: string;
};

export type Medicine = {
  id: string;
  name: string;
  code: string;
  available_quantity: number;
  is_active: boolean;
};

export type LabOrder = {
  id: string;
  patient: string;
  doctor: string;
  status: string;
  created_at: string;
  reported_at: string | null;
};

export type LabOrderItem = {
  id: string;
  lab_test: string;
};

export type LabResult = {
  id: string;
  value: string;
  unit: string;
  interpretation: string;
  status: string;
};
