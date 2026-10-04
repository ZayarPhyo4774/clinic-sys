"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { BranchSelect, ClinicUserSelect, DepartmentSelect } from "@/components/entity-picker";
import { FormError, FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { staffTypeOptions } from "@/features/organization/contract";
import { api } from "@/lib/api/client";
import type { DoctorProfile, NurseProfile, Staff } from "@/lib/api/types";
import {
  doctorProfileSchema,
  nurseProfileSchema,
  staffLinkSchema,
  staffUpdateSchema,
  validateForm,
} from "@/lib/forms/schemas";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const jobTitleHints: Record<string, string> = {
  doctor: "Physician",
  nurse: "Registered nurse",
  other: "Receptionist",
};

export function LinkStaffForm({ onLinked }: { onLinked?: () => void }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [staffType, setStaffType] = useState("doctor");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("staff.create", isOnline());
      return api<Staff>("/staff/", {
        method: "POST",
        body: JSON.stringify({
          user,
          branch,
          department: department || undefined,
          staff_type: staffType,
          job_title: jobTitle || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setUser("");
      setBranch("");
      setDepartment("");
      setStaffType("doctor");
      setJobTitle("");
      setError(null);
      toast.success("Staff member linked.");
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      onLinked?.();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(staffLinkSchema, { user, branch, staff_type: staffType }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <ClinicUserSelect id="staff_user" value={user} onValueChange={setUser} />
        <BranchSelect id="staff_branch" value={branch} onValueChange={setBranch} />
        <DepartmentSelect
          id="staff_department"
          value={department}
          onValueChange={setDepartment}
          branchId={branch}
        />
        <div className="space-y-2">
          <Label htmlFor="staff_type">Staff type</Label>
          <Select value={staffType} onValueChange={setStaffType}>
            <SelectTrigger id="staff_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[100]">
              {staffTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Doctors get a clinical profile automatically for appointments and schedules.
          </p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="staff_job_title">Job title</Label>
          <Input
            id="staff_job_title"
            placeholder={jobTitleHints[staffType] ?? "Job title"}
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use a clinical title like &quot;Physician&quot; — avoid vague labels like &quot;Head&quot;.
          </p>
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Link staff member"}
      </Button>
      <FormFieldError error={error} name="user" />
      <FormError error={error} />
    </form>
  );
}

export function EditStaffForm({ staff, onUpdated }: { staff: Staff; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState(staff.department ?? "");
  const [jobTitle, setJobTitle] = useState(staff.job_title ?? "");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setDepartment(staff.department ?? "");
    setJobTitle(staff.job_title ?? "");
  }, [staff.department, staff.job_title]);

  const mutation = useMutation({
    mutationFn: () => {
      requireOnlineMutation("staff.update", isOnline());
      return api<Staff>(`/staff/${staff.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          job_title: jobTitle || "",
          department: department || null,
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Staff assignment updated.");
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      onUpdated();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(staffUpdateSchema, { job_title: jobTitle, department }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Staff type</Label>
          <Input value={staff.staff_type} disabled />
          <p className="text-xs text-muted-foreground">Type cannot change while a clinical profile exists.</p>
        </div>
        <div className="space-y-2">
          <Label>User</Label>
          <Input value={staff.user_full_name || staff.user_email} disabled />
        </div>
        <DepartmentSelect
          id="edit_staff_department"
          value={department}
          onValueChange={setDepartment}
          branchId={staff.branch}
        />
        <div className="space-y-2">
          <Label htmlFor="edit_staff_job_title">Job title</Label>
          <Input
            id="edit_staff_job_title"
            placeholder={jobTitleHints[staff.staff_type] ?? "Job title"}
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save assignment"}
      </Button>
      <FormError error={error} />
    </form>
  );
}

export function DoctorProfileForm({
  staffId,
  profile,
  onSaved,
}: {
  staffId: string;
  profile: DoctorProfile | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number ?? "");
  const [specialty, setSpecialty] = useState(profile?.specialty ?? "General practice");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLicenseNumber(profile?.license_number ?? "");
    setSpecialty(profile?.specialty ?? "General practice");
  }, [profile?.license_number, profile?.specialty]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { license_number: licenseNumber, specialty };
      if (profile) {
        requireOnlineMutation("doctor_profiles.update", isOnline());
        return api(`/doctor-profiles/${profile.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      requireOnlineMutation("doctor_profiles.create", isOnline());
      return api("/doctor-profiles/", {
        method: "POST",
        body: JSON.stringify({ staff: staffId, ...payload }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success(profile ? "Doctor profile updated." : "Doctor profile created.");
      await queryClient.invalidateQueries({ queryKey: ["doctor-profiles"] });
      onSaved();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(doctorProfileSchema, { license_number: licenseNumber, specialty }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="doctor_license">License number</Label>
        <Input id="doctor_license" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
        <FormFieldError error={error} name="license_number" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="doctor_specialty">Specialty</Label>
        <Input
          id="doctor_specialty"
          placeholder="General practice"
          value={specialty}
          onChange={(event) => setSpecialty(event.target.value)}
        />
        <FormFieldError error={error} name="specialty" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : profile ? "Save doctor profile" : "Create doctor profile"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}

export function NurseProfileForm({
  staffId,
  profile,
  onSaved,
}: {
  staffId: string;
  profile: NurseProfile | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number ?? "");
  const [grade, setGrade] = useState(profile?.grade ?? "");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLicenseNumber(profile?.license_number ?? "");
    setGrade(profile?.grade ?? "");
  }, [profile?.license_number, profile?.grade]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { license_number: licenseNumber, grade };
      if (profile) {
        requireOnlineMutation("nurse_profiles.update", isOnline());
        return api(`/nurse-profiles/${profile.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      requireOnlineMutation("nurse_profiles.create", isOnline());
      return api("/nurse-profiles/", {
        method: "POST",
        body: JSON.stringify({ staff: staffId, ...payload }),
      });
    },
    onSuccess: async () => {
      setError(null);
      toast.success(profile ? "Nurse profile updated." : "Nurse profile created.");
      await queryClient.invalidateQueries({ queryKey: ["nurse-profiles"] });
      onSaved();
    },
    onError: (caught) => setError(caught),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateForm(nurseProfileSchema, { license_number: licenseNumber, grade }, setError)) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="nurse_license">License number</Label>
        <Input id="nurse_license" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
        <FormFieldError error={error} name="license_number" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nurse_grade">Grade</Label>
        <Input id="nurse_grade" value={grade} onChange={(event) => setGrade(event.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : profile ? "Save nurse profile" : "Create nurse profile"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormError error={error} />
      </div>
    </form>
  );
}
