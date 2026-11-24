// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const revisableArena = vi.hoisted(() => ({
  id: "arena-prefill-1", owner_name: "Venue Owner", owner_email: "owner@example.com", owner_phone: "+919876543210", business_name: "Venue Ops Pvt Ltd", business_registration_number: "REG-123", name: "Existing Arena", description: "Existing description", address: "10 Court Road", locality: "HSR Layout", city: "Bengaluru", state: "Karnataka", pin_code: "560102", google_maps_url: "https://maps.google.com/example", latitude: 12.9, longitude: 77.6, amenities: ["Parking"], weekly_schedule: {}, verification_document_path: "owner/document.pdf",
}));

vi.mock("wouter", () => ({ useLocation: () => ["/list-your-arena?arena=arena-prefill-1", navigate] }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/api", () => ({ api: {
  me: vi.fn(async () => ({ user: { id: "owner-1", email: "owner@example.com", role: "ARENA_OWNER" } })),
  sports: vi.fn(async () => [{ id: "sport-1", name: "Badminton" }]),
  myArenas: vi.fn(async () => [{ ...revisableArena, arena_sports: [{ sport_id: "sport-1" }], arena_courts: [{ name: "Court One", sport_id: "sport-1", hourly_price: "500", capacity: 2, indoor: true }], equipment: [{ name: "Racket", stock: 4, rental_price: "50" }], arena_images: [{ id: "image-1" }] }]),
} }));

import { ArenaRegistrationWorkflow } from "./VerificationWorkflow";

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe("ArenaRegistrationWorkflow selected-arena prefill", () => {
  it("preloads the requested revisable arena and carries saved venue fields into the edit step", async () => {
    render(<ArenaRegistrationWorkflow />);

    await waitFor(() => expect(screen.getByDisplayValue("Venue Owner")).toBeTruthy());
    expect(screen.getByDisplayValue("Venue Ops Pvt Ltd")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByDisplayValue("Existing Arena")).toBeTruthy());
    expect(screen.getByDisplayValue("Existing description")).toBeTruthy();
    expect(screen.getByDisplayValue("10 Court Road")).toBeTruthy();
  });

  it("fills precise coordinates and a map link after the owner grants current-location permission", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success: (position: GeolocationPosition) => void) => success({ coords: { latitude: 12.971599, longitude: 77.594566 } } as GeolocationPosition) } });
    render(<ArenaRegistrationWorkflow />);
    await waitFor(() => expect(screen.getByDisplayValue("Venue Owner")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    const capture = await screen.findByRole("button", { name: /use current location/i });
    fireEvent.click(capture);
    await waitFor(() => expect(screen.getByDisplayValue("12.971599")).toBeTruthy());
    expect(screen.getByDisplayValue("77.594566")).toBeTruthy();
    expect(screen.getByDisplayValue("https://www.google.com/maps?q=12.971599,77.594566")).toBeTruthy();
  });
});
