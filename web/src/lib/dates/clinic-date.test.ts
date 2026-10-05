import { describe, expect, it } from "vitest";

import { addDaysIso, localDateIso } from "@/lib/dates/clinic-date";

describe("clinic-date", () => {
  it("formats a date in the clinic timezone", () => {
    const reference = new Date("2026-10-05T20:00:00.000Z");
    expect(localDateIso("Asia/Yangon", reference)).toBe("2026-10-06");
  });

  it("adds days within the clinic timezone", () => {
    expect(addDaysIso("2026-10-06", -1, "Asia/Yangon")).toBe("2026-10-05");
  });
});
