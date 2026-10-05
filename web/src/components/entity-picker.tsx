"use client";

import { useEffect } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import type { Branch, Department, Medicine, Patient } from "@/lib/api/types";
import { formatDoctorPersonName } from "@/lib/doctor-display";

type DoctorProfileOption = {
  id: string;
  staff: string;
  specialty: string;
  staff_full_name?: string;
  staff_email?: string;
};

type LabTest = {
  id: string;
  code: string;
  name: string;
};

type MedicineBatch = {
  id: string;
  batch_number: string;
  quantity_on_hand: string;
  expiry_date: string;
  is_active: boolean;
};

export function PatientSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const patients = useResourceList<Patient>("patients", withQuery("/patients/", { page_size: "100" }));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Patient</Label>
      <Select value={value || undefined} onValueChange={onValueChange} disabled={patients.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={patients.isLoading ? "Loading…" : "Select patient"} />
        </SelectTrigger>
        <SelectContent>
          {patients.data?.map((patient) => (
            <SelectItem key={patient.id} value={patient.id}>
              {patient.full_name} ({patient.patient_number})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type DoctorLabelContext = {
  preferEmail?: string;
  preferName?: string;
  soloDoctor?: boolean;
};

function doctorDisplayName(profile: DoctorProfileOption, context?: DoctorLabelContext) {
  const nameFromApi = formatDoctorPersonName(profile);
  if (profile.staff_full_name?.trim()) {
    return nameFromApi;
  }
  if (context?.preferEmail && profile.staff_email === context.preferEmail && context.preferName) {
    return context.preferName;
  }
  if (context?.soloDoctor && context.preferName) {
    return context.preferName;
  }
  return nameFromApi;
}

function doctorOptionLabel(profile: DoctorProfileOption, context?: DoctorLabelContext) {
  const name = doctorDisplayName(profile, context);
  const specialty = profile.specialty?.trim();
  if (specialty && specialty !== name) {
    return `${name} · ${specialty}`;
  }
  return name;
}

export function DoctorSelect({
  id,
  value,
  onValueChange,
  preferEmail,
  preferName,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Auto-select the doctor profile linked to this staff email when unset. */
  preferEmail?: string;
  /** Fallback display name when the API omits staff_full_name for the signed-in doctor. */
  preferName?: string;
}) {
  const profiles = useResourceList<DoctorProfileOption>(
    "doctor-profiles",
    withQuery("/doctor-profiles/", { page_size: "100", is_active: "true" }),
  );
  const options = profiles.data ?? [];
  const labelContext = { preferEmail, preferName, soloDoctor: options.length === 1 };
  const emptyMessage =
    profiles.isError
      ? "Could not load doctors. Check your branch and permissions."
      : "No doctors available. Add staff with type Doctor and ensure a branch is selected.";

  useEffect(() => {
    if (value || options.length === 0) {
      return;
    }
    const preferred = preferEmail
      ? options.find((profile) => profile.staff_email === preferEmail)
      : undefined;
    const pick = preferred ?? (options.length === 1 ? options[0] : undefined);
    if (pick) {
      onValueChange(pick.id);
    }
  }, [options, onValueChange, preferEmail, value]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Doctor</Label>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={profiles.isLoading || options.length === 0}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={profiles.isLoading ? "Loading…" : "Select doctor"} />
        </SelectTrigger>
        <SelectContent position="popper" className="z-[100]">
          {options.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {doctorOptionLabel(profile, labelContext)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!profiles.isLoading && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}
    </div>
  );
}

export function MedicineSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const medicines = useResourceList<Medicine>("medicines", withQuery("/medicines/", { page_size: "100" }));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Medicine</Label>
      <Select value={value} onValueChange={onValueChange} disabled={medicines.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={medicines.isLoading ? "Loading…" : "Select medicine"} />
        </SelectTrigger>
        <SelectContent>
          {medicines.data?.map((medicine) => (
            <SelectItem key={medicine.id} value={medicine.id}>
              {medicine.name} ({medicine.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LabTestSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const tests = useResourceList<LabTest>("lab-tests", withQuery("/lab-tests/", { page_size: "100" }));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Lab test</Label>
      <Select value={value} onValueChange={onValueChange} disabled={tests.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={tests.isLoading ? "Loading…" : "Select test"} />
        </SelectTrigger>
        <SelectContent>
          {tests.data?.map((test) => (
            <SelectItem key={test.id} value={test.id}>
              {test.name} ({test.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type MedicineCategory = {
  id: string;
  name: string;
  code: string;
};

type Supplier = {
  id: string;
  name: string;
  code: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  code: string;
};

export function CategorySelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const categories = useResourceList<MedicineCategory>(
    "medicine-categories",
    withQuery("/medicine-categories/", { page_size: "100", is_active: "true" }),
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Category</Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={categories.isLoading || categories.isError}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              categories.isLoading
                ? "Loading…"
                : categories.isError
                  ? "Could not load categories"
                  : categories.data?.length
                    ? "Select category"
                    : "No categories yet"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {categories.data?.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name} ({category.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {categories.isError ? (
        <p className="text-sm text-destructive">Categories could not be loaded. Create one in Catalog setup first.</p>
      ) : null}
    </div>
  );
}

export function SupplierSelect({
  id,
  value,
  onValueChange,
  optional = false,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  optional?: boolean;
}) {
  const suppliers = useResourceList<Supplier>(
    "suppliers",
    withQuery("/suppliers/", { page_size: "100", is_active: "true" }),
  );
  const resolvedValue = value || (optional ? "__none__" : "");

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Supplier</Label>
      <Select
        value={resolvedValue}
        onValueChange={(next) => onValueChange(next === "__none__" ? "" : next)}
        disabled={suppliers.isLoading}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={suppliers.isLoading ? "Loading…" : "Select supplier"} />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value="__none__">None</SelectItem> : null}
          {suppliers.data?.map((supplier) => (
            <SelectItem key={supplier.id} value={supplier.id}>
              {supplier.name} ({supplier.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PaymentMethodSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const methods = useResourceList<PaymentMethod>(
    "payment-methods",
    withQuery("/payment-methods/", { page_size: "100" }),
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Payment method</Label>
      <Select value={value} onValueChange={onValueChange} disabled={methods.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={methods.isLoading ? "Loading…" : "Select method"} />
        </SelectTrigger>
        <SelectContent>
          {methods.data?.map((method) => (
            <SelectItem key={method.id} value={method.id}>
              {method.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BranchSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const branches = useResourceList<Branch>("branches", withQuery("/branches/", { page_size: "100" }));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Branch</Label>
      <Select value={value} onValueChange={onValueChange} disabled={branches.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={branches.isLoading ? "Loading…" : "Select branch"} />
        </SelectTrigger>
        <SelectContent>
          {branches.data?.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name} ({branch.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DepartmentSelect({
  id,
  value,
  onValueChange,
  branchId,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  branchId?: string;
}) {
  const departments = useResourceList<Department>(
    "departments",
    withQuery("/departments/", { page_size: "100", branch: branchId || undefined }),
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Department</Label>
      <Select value={value} onValueChange={onValueChange} disabled={departments.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={departments.isLoading ? "Loading…" : "Select department"} />
        </SelectTrigger>
        <SelectContent>
          {departments.data?.map((department) => (
            <SelectItem key={department.id} value={department.id}>
              {department.name} ({department.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type ClinicUser = {
  id: string;
  email: string;
  full_name: string;
};

export function ClinicUserSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const users = useResourceList<ClinicUser>("admin-users", "/admin/users/");

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>User</Label>
      <Select value={value} onValueChange={onValueChange} disabled={users.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={users.isLoading ? "Loading…" : "Select user"} />
        </SelectTrigger>
        <SelectContent>
          {users.data?.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.full_name} ({user.email})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BatchSelect({
  id,
  medicineId,
  value,
  onValueChange,
  includeInactive = false,
}: {
  id: string;
  medicineId: string;
  value: string;
  onValueChange: (value: string) => void;
  includeInactive?: boolean;
}) {
  const batches = useResourceList<MedicineBatch>(
    "medicine-batches",
    medicineId ? withQuery("/medicine-batches/", { medicine: medicineId, page_size: "100" }) : null,
  );

  function expiryMeta(expiryDate: string) {
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return { label: "Expiry unknown", nearExpiry: false };
    }
    const now = new Date();
    const msLeft = expiry.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      return { label: "Expired", nearExpiry: true };
    }
    if (daysLeft <= 30) {
      return { label: `Expires in ${daysLeft}d`, nearExpiry: true };
    }
    return { label: `Expires in ${daysLeft}d`, nearExpiry: false };
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Batch</Label>
      <Select value={value} onValueChange={onValueChange} disabled={!medicineId || batches.isLoading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={batches.isLoading ? "Loading…" : "Select batch"} />
        </SelectTrigger>
        <SelectContent>
          {batches.data
            ?.filter((batch) => includeInactive || batch.is_active)
            .map((batch) => {
              const meta = expiryMeta(batch.expiry_date);
              return (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.batch_number} · {batch.quantity_on_hand} on hand · {meta.label}
                  {meta.nearExpiry ? " (check)" : ""}
                </SelectItem>
              );
            })}
        </SelectContent>
      </Select>
    </div>
  );
}
