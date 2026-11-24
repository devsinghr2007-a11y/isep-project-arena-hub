import { describe, expect, it } from "vitest";
import { formatOwnerSlotTime, isOwnerMutableSlot, validateOwnerSlot } from "./ownerSlots";

describe("owner slot helpers", () => {
  it("rejects incomplete, reversed, and negative-price slots before a database mutation", () => {
    expect(validateOwnerSlot({ courtId: "", slotDate: "2026-08-26", startTime: "09:00", endTime: "10:00", price: "500", status: "AVAILABLE" })).toMatch(/choose a court/i);
    expect(validateOwnerSlot({ courtId: "court-1", slotDate: "2026-08-26", startTime: "10:00", endTime: "09:00", price: "500", status: "AVAILABLE" })).toMatch(/later/i);
    expect(validateOwnerSlot({ courtId: "court-1", slotDate: "2026-08-26", startTime: "09:00", endTime: "10:00", price: "-1", status: "AVAILABLE" })).toMatch(/non-negative/i);
  });

  it("only exposes changes for non-reserved slots", () => {
    expect(isOwnerMutableSlot("AVAILABLE")).toBe(true);
    expect(isOwnerMutableSlot("BLOCKED")).toBe(true);
    expect(isOwnerMutableSlot("HELD")).toBe(false);
    expect(isOwnerMutableSlot("BOOKED")).toBe(false);
    expect(formatOwnerSlotTime("18:05:00")).toBe("6:05 PM");
  });
});
