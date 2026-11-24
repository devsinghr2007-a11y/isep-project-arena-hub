import { describe, expect, it } from "vitest";
import { clampEquipmentQuantity, getEquipmentRentalTotal } from "./bookingEquipment";

describe("booking equipment helpers", () => {
  it("keeps rental quantities between zero and the available stock", () => {
    expect(clampEquipmentQuantity(-1, 4)).toBe(0);
    expect(clampEquipmentQuantity(2.9, 4)).toBe(2);
    expect(clampEquipmentQuantity(9, 4)).toBe(4);
  });

  it("calculates the rental charge from selected quantities without exceeding availability", () => {
    expect(getEquipmentRentalTotal([
      { id: "racket", name: "Racket", rentalPrice: "75", availableStock: 2 },
      { id: "shuttle", name: "Shuttle", rentalPrice: 30, availableStock: 3 },
    ], { racket: 3, shuttle: 2 })).toBe(210);
  });
});
