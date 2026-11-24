// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const tableData = vi.hoisted(() => ({
  arenas: [{ id: "arena-1", name: "Central Sports Hub", locality: "HSR Layout", city: "Bengaluru", verification_status: "DRAFT", updated_at: "2026-08-26T00:00:00.000Z" }],
  arena_courts: [{ id: "court-1", name: "Court One", sport_id: "sport-1", active: true }],
  arena_slots: [
    { id: "slot-1", arena_id: "arena-1", court_id: "court-1", sport_id: "sport-1", slot_date: "2026-08-27", start_time: "09:00:00", end_time: "10:00:00", price: "500", currency: "INR", status: "AVAILABLE" },
    { id: "slot-2", arena_id: "arena-1", court_id: "court-1", sport_id: "sport-1", slot_date: "2026-08-27", start_time: "10:00:00", end_time: "11:00:00", price: "500", currency: "INR", status: "HELD" },
  ],
}));
const mutations = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("wouter", () => ({ useLocation: () => ["/owner/dashboard", navigate] }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/pages/VerificationWorkflow", () => ({
  SecureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSecureProfile: () => ({ loading: false, id: "owner-1", email: "owner@example.com", role: "ARENA_OWNER" }),
}));
vi.mock("@/lib/api", () => ({ api: {
  myArenas: vi.fn(async () => tableData.arenas),
  managedArena: vi.fn(async () => ({ arena_courts: tableData.arena_courts, arena_slots: tableData.arena_slots })),
  addSlot: vi.fn((_: string, payload: unknown) => { mutations.insert(payload); return Promise.resolve({}); }),
  updateSlot: vi.fn((_: string, __: string, payload: unknown) => { mutations.update(payload); return Promise.resolve({}); }),
  removeSlot: vi.fn(() => { mutations.remove(); return Promise.resolve(); }),
} }));

import OwnerArenaManagement from "./OwnerArenaManagement";

afterEach(() => {
  cleanup();
  navigate.mockReset();
  mutations.insert.mockReset();
  mutations.update.mockReset();
  mutations.remove.mockReset();
});

describe("OwnerArenaManagement", () => {
  it("shows the owner’s saved arena, prefilled-edit entry point, and current editable slot controls", async () => {
    render(<OwnerArenaManagement />);

    await waitFor(() => expect(screen.getByText("Central Sports Hub")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Court One").length).toBeGreaterThan(1));

    expect(screen.getByRole("button", { name: /edit saved details/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add time slot/i })).toBeTruthy();
    expect(screen.getAllByDisplayValue("2026-08-27").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.getByText(/this held slot is protected/i)).toBeTruthy();
  });

  it("creates, updates, and removes an unreserved owner slot while preserving held-slot controls", async () => {
    render(<OwnerArenaManagement />);
    await waitFor(() => expect(screen.getAllByText("Court One").length).toBeGreaterThan(1));

    fireEvent.click(screen.getByRole("button", { name: /add time slot/i }));
    await waitFor(() => expect(mutations.insert).toHaveBeenCalled());
    expect(mutations.insert.mock.calls[0][0]).toMatchObject({ courtId: "court-1", status: "AVAILABLE" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalled());
    expect(mutations.update.mock.calls[0][0]).toMatchObject({ status: "AVAILABLE", price: 500 });

    fireEvent.click(screen.getByRole("button", { name: /remove court one slot/i }));
    await waitFor(() => expect(mutations.remove).toHaveBeenCalled());
    expect(screen.getAllByRole("button", { name: "Save" }).length).toBe(1);
  });
});
