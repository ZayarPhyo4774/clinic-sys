import { describe, expect, it } from "vitest";

import { generateAppointmentSlots, parseScheduleTime, zonedDateTimeToUtc } from "@/features/appointments/appointment-slots";
import type { DoctorSchedule } from "@/lib/api/types";

function schedule(partial: Partial<DoctorSchedule> & Pick<DoctorSchedule, "weekday">): DoctorSchedule {
  return {
    id: "sched-1",
    clinic: "clinic-1",
    branch: "branch-1",
    doctor: "doctor-1",
    weekday: partial.weekday,
    start_time: partial.start_time ?? "09:00:00",
    end_time: partial.end_time ?? "10:00:00",
    slot_minutes: partial.slot_minutes ?? 30,
    effective_from: partial.effective_from ?? null,
    effective_until: partial.effective_until ?? null,
    is_active: partial.is_active ?? true,
  };
}

describe("appointment slots", () => {
  it("parses schedule times", () => {
    expect(parseScheduleTime("09:30:00")).toEqual({ hours: 9, minutes: 30 });
  });

  it("maps wall-clock clinic time to UTC", () => {
    const utc = zonedDateTimeToUtc(
      { year: 2026, month: 10, day: 6, hour: 9, minute: 0 },
      "Asia/Yangon",
    );
    expect(utc.toISOString()).toBe("2026-10-06T02:30:00.000Z");
  });

  it("generates aligned slots for a doctor schedule", () => {
    const slots = generateAppointmentSlots(
      [schedule({ weekday: 1, start_time: "09:00:00", end_time: "10:00:00", slot_minutes: 30 })],
      "UTC",
      {
        now: new Date("2026-10-06T08:00:00.000Z"),
        daysAhead: 0,
        limit: 10,
      },
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]?.starts_at).toBe("2026-10-06T09:00:00.000Z");
    expect(slots[0]?.ends_at).toBe("2026-10-06T09:30:00.000Z");
  });
});
