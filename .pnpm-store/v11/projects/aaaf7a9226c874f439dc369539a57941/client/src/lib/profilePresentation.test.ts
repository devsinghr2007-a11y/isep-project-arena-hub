import { describe, expect, it } from "vitest";
import { formatProfileDate, getRoleProfileConfig } from "./profilePresentation";

describe("ArenaHub role profile presentation", () => {
  it("maps the role-specific workspaces to their secure profiles", () => {
    expect(getRoleProfileConfig("CUSTOMER")).toMatchObject({ label: "Customer", primaryAction: { route: "/arenas" } });
    expect(getRoleProfileConfig("ARENA_OWNER")).toMatchObject({ label: "Arena Owner", primaryAction: { route: "/owner/dashboard" } });
    expect(getRoleProfileConfig("SHOPKEEPER")).toMatchObject({ label: "Shopkeeper", primaryAction: { route: "/shopkeeper/dashboard" } });
    expect(getRoleProfileConfig("ADMIN")).toMatchObject({ label: "Administrator", primaryAction: { route: "/admin/dashboard" } });
  });

  it("formats profile membership dates without inventing a date when none is available", () => {
    expect(formatProfileDate()).toBe("Recently joined");
    expect(formatProfileDate("2026-08-01T00:00:00.000Z")).toBe("Member since Aug 2026");
  });
});
