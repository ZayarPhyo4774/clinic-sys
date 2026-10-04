import { describe, expect, it } from "vitest";

import { ApiError, humanizeFieldMessage, isBranchAuthorizationError } from "@/lib/api/errors";

describe("isBranchAuthorizationError", () => {
  it("detects branch authorization failures", () => {
    expect(isBranchAuthorizationError(new ApiError(403, "Branch is not authorized.", "permission_denied", {}))).toBe(
      true,
    );
    expect(
      isBranchAuthorizationError(new ApiError(400, "Invalid", "validation_error", { branch: ["This field is required."] })),
    ).toBe(true);
    expect(isBranchAuthorizationError(new ApiError(403, "You do not have permission.", "permission_denied", {}))).toBe(
      false,
    );
  });
});

describe("humanizeFieldMessage", () => {
  it("turns generic required errors into field-specific guidance", () => {
    expect(humanizeFieldMessage("doctor", "This field is required.")).toBe("Choose a doctor.");
    expect(humanizeFieldMessage("unit_price", "This field is required.")).toBe("Enter a unit price.");
  });
});
