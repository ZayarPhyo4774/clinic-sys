import { shortId } from "@/lib/utils";

export type DoctorNameSource = {
  staff_full_name?: string | null;
  staff_email?: string | null;
  specialty?: string | null;
  id?: string;
};

/** Person name for a doctor profile — never uses specialty. */
export function formatDoctorPersonName(profile: DoctorNameSource) {
  const name = profile.staff_full_name?.trim();
  if (name) {
    return name;
  }
  const email = profile.staff_email?.trim();
  if (email) {
    return email;
  }
  if (profile.id) {
    return shortId(profile.id);
  }
  return "Unknown doctor";
}

/** Label for doctor dropdowns: name first, specialty only as secondary detail. */
export function formatDoctorOptionLabel(profile: DoctorNameSource & { specialty?: string }) {
  const name = formatDoctorPersonName(profile);
  const specialty = profile.specialty?.trim();
  if (specialty && specialty !== name) {
    return `${name} · ${specialty}`;
  }
  return name;
}
