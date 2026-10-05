const MS_PER_DAY = 86_400_000;

export function localDateIso(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function addDaysIso(isoDate: string, days: number, timeZone: string): string {
  let anchor = new Date(`${isoDate}T12:00:00Z`);
  while (localDateIso(timeZone, anchor) !== isoDate) {
    anchor = new Date(anchor.getTime() + MS_PER_DAY);
  }
  return localDateIso(timeZone, new Date(anchor.getTime() + days * MS_PER_DAY));
}

export function clinicTimeZone(preferred?: string | null): string {
  return preferred || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
