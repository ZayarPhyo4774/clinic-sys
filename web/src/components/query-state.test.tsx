import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QueryState, describeError } from "@/components/query-state";
import { ApiError } from "@/lib/api/errors";

describe("page states", () => {
  it("renders loading, empty, and forbidden states", () => {
    expect(renderToStaticMarkup(<QueryState status="loading" />)).toContain("Loading");
    expect(renderToStaticMarkup(<QueryState status="empty" detail="No patients are available." />)).toContain(
      "No patients are available.",
    );
    expect(renderToStaticMarkup(<QueryState status="forbidden" title="Billing" />)).toContain("Billing");
    expect(renderToStaticMarkup(<QueryState status="unavailable" title="Reports" />)).toContain("not available");
    expect(renderToStaticMarkup(<QueryState status="branch_required" title="Branch required" />)).toContain(
      "Branch required",
    );
  });

  it("describes an API error with the server message", () => {
    expect(describeError(new ApiError(403, "You do not have permission.", "permission_denied", {}))).toBe(
      "You do not have permission.",
    );
  });

  it("describes validation field errors instead of a generic failure", () => {
    expect(
      describeError(
        new ApiError(400, "Validation failed.", "validation_error", {
          doctor: ["This field is required."],
        }),
      ),
    ).toBe("Choose a doctor.");
  });
});
