// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const secureState = vi.hoisted(() => ({
  value: { loading: false, id: "profile-1", email: "member@example.com", role: "CUSTOMER" as "CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER" | "ADMIN" | undefined },
}));

vi.mock("@/lib/api", () => ({ api: { profileDashboard: vi.fn(async () => ({ profile: { full_name: "ArenaHub member", email: "member@example.com", created_at: "2026-08-01T00:00:00.000Z" }, arenas: [], stats: {} })), logout: vi.fn() } }));
vi.mock("@/pages/VerificationWorkflow", () => ({ useSecureProfile: () => secureState.value }));

import ProfilePage from "./ProfilePage";

afterEach(() => {
  cleanup();
  secureState.value = { loading: false, id: "profile-1", email: "member@example.com", role: "CUSTOMER" };
});

describe("ArenaHub role-aware profile page", () => {
  it("renders player profile scope and player actions", () => {
    render(<ProfilePage />);
    expect(screen.getByText("PLAYER PROFILE")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /explore verified arenas/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Player").length).toBeGreaterThan(0);
  });

  it("renders the arena-owner workspace summary for owner accounts", () => {
    secureState.value = { loading: false, id: "owner-1", email: "owner@example.com", role: "ARENA_OWNER" };
    render(<ProfilePage />);
    expect(screen.getByText("VENUE OPERATIONS PROFILE")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /open owner workspace/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("MY ARENA APPLICATIONS")).toBeTruthy();
  });

  it("renders the administrator verification profile for the designated admin role", () => {
    secureState.value = { loading: false, id: "admin-1", email: "deepak843161.438@gmail.com", role: "ADMIN" };
    render(<ProfilePage />);
    expect(screen.getByText("ARENAHUB CONTROL PROFILE")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /open verification queue/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("ADMIN SAFEGUARD")).toBeTruthy();
  });

  it("protects the profile route when no authenticated account is present", () => {
    secureState.value = { loading: false, id: "", email: "", role: undefined };
    render(<ProfilePage />);
    expect(screen.getByText("Sign in to view your profile.")).toBeTruthy();
  });
});
