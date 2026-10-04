import type { DoctorSchedule } from "@/lib/api/types";

export type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type AppointmentSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  label: string;
};

const WEEKDAY_TO_PYTHON: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function parseScheduleTime(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return { hours, minutes };
}

export function zonedDateTimeToUtc(parts: DateParts, timeZone: string): Date {
  let utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const mapped: Record<string, string> = {};
    for (const piece of formatter.formatToParts(new Date(utc))) {
      if (piece.type !== "literal") {
        mapped[piece.type] = piece.value;
      }
    }
    const asUtc = Date.UTC(
      Number(mapped.year),
      Number(mapped.month) - 1,
      Number(mapped.day),
      Number(mapped.hour),
      Number(mapped.minute),
    );
    const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const diff = target - asUtc;
    if (diff === 0) {
      break;
    }
    utc += diff;
  }

  return new Date(utc);
}

function partsInTimeZone(date: Date, timeZone: string): DateParts & { weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const mapped: Record<string, string> = {};
  for (const piece of formatter.formatToParts(date)) {
    if (piece.type !== "literal") {
      mapped[piece.type] = piece.value;
    }
  }
  const weekdayLabel = mapped.weekday ?? "Mon";
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    weekday: WEEKDAY_TO_PYTHON[weekdayLabel] ?? 0,
  };
}

function addDays(parts: DateParts, days: number, timeZone: string): DateParts & { weekday: number } {
  const anchor = zonedDateTimeToUtc({ ...parts, hour: 12, minute: 0 }, timeZone);
  const shifted = new Date(anchor.getTime() + days * 86_400_000);
  return partsInTimeZone(shifted, timeZone);
}

function formatSlotLabel(start: Date, end: Date, timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFormatter.format(start)} · ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
}

function withinEffectiveDates(
  schedule: DoctorSchedule,
  year: number,
  month: number,
  day: number,
) {
  const dayIso = `${year}-${pad(month)}-${pad(day)}`;
  if (schedule.effective_from && dayIso < schedule.effective_from) {
    return false;
  }
  if (schedule.effective_until && dayIso > schedule.effective_until) {
    return false;
  }
  return true;
}

export function generateAppointmentSlots(
  schedules: DoctorSchedule[],
  timeZone: string,
  options?: { daysAhead?: number; now?: Date; limit?: number },
): AppointmentSlot[] {
  const daysAhead = options?.daysAhead ?? 14;
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 80;
  const activeSchedules = schedules.filter((row) => row.is_active);
  if (activeSchedules.length === 0) {
    return [];
  }

  const today = partsInTimeZone(now, timeZone);
  const slots: AppointmentSlot[] = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const day = addDays(today, offset, timeZone);
    const daySchedules = activeSchedules.filter((row) => row.weekday === day.weekday);
    for (const schedule of daySchedules) {
      if (!withinEffectiveDates(schedule, day.year, day.month, day.day)) {
        continue;
      }
      const start = parseScheduleTime(schedule.start_time);
      const end = parseScheduleTime(schedule.end_time);
      let cursor = zonedDateTimeToUtc(
        { year: day.year, month: day.month, day: day.day, hour: start.hours, minute: start.minutes },
        timeZone,
      );
      const windowEnd = zonedDateTimeToUtc(
        { year: day.year, month: day.month, day: day.day, hour: end.hours, minute: end.minutes },
        timeZone,
      );
      const stepMs = schedule.slot_minutes * 60_000;

      while (cursor.getTime() + stepMs <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + stepMs);
        if (slotEnd > now) {
          const starts_at = cursor.toISOString();
          const ends_at = slotEnd.toISOString();
          slots.push({
            id: `${starts_at}|${ends_at}`,
            starts_at,
            ends_at,
            label: formatSlotLabel(cursor, slotEnd, timeZone),
          });
          if (slots.length >= limit) {
            return slots;
          }
        }
        cursor = slotEnd;
      }
    }
  }

  return slots;
}
