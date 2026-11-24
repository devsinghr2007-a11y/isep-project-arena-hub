// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const arenaDetail = vi.hoisted(() => ({
  id: "arena-1", name: "Equipment Arena", description: "Court bookings with rental gear.", address: "1 Sports Lane", locality: "HSR Layout", city: "Bengaluru", amenities: [], opening_time: "09:00:00", closing_time: "22:00:00", rating: 0, review_count: 0, cover_image_path: null,
  arena_sports: [{ sports: { name: "Badminton" } }], arena_images: [],
  arena_courts: [{ id: "court-1", name: "Court One", description: null, indoor: true, capacity: 2, active: true, sports: { name: "Badminton" } }],
  arena_slots: [{ id: "slot-1", court_id: "court-1", slot_date: "2026-08-27", start_time: "09:00:00", end_time: "10:00:00", price: "500", currency: "INR", status: "AVAILABLE" }],
  equipment: [{ id: "bat-1", name: "Cricket Bat", category: "Bat", description: null, rental_price: "75", available_stock: 2, active: true }],
}));

vi.mock("wouter", () => ({ useLocation: () => ["/arenas/arena-1", navigate] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { arena: vi.fn(async () => arenaDetail) } }));

import { ArenaDetailPage } from "./Home";

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe("ArenaDetailPage equipment rental", () => {
  it("updates the booking summary and stops at the published equipment stock limit", async () => {
    render(<ArenaDetailPage />);

    await waitFor(() => expect(screen.getByText("Cricket Bat")).toBeTruthy());
    const addBat = screen.getByRole("button", { name: /add one cricket bat/i });
    expect((addBat as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("9:00 AM – 10:00 AM"));
    await waitFor(() => expect((addBat as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(addBat);
    fireEvent.click(addBat);

    expect(screen.getByLabelText("Cricket Bat quantity").textContent).toContain("2");
    expect((addBat as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("₹650")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /remove one cricket bat/i }));
    expect(screen.getByLabelText("Cricket Bat quantity").textContent).toContain("1");
    expect(screen.getByText("₹575")).toBeTruthy();
  });

  it("offers players a directions action on the approved arena detail page", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ArenaDetailPage />);
    const directions = await screen.findByRole("button", { name: /get directions/i });
    fireEvent.click(directions);
    expect(open).toHaveBeenCalledWith(expect.stringContaining("google.com/maps/dir/?api=1"), "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
