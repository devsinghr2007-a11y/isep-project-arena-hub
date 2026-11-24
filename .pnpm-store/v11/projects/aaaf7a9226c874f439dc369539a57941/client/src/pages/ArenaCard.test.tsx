// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({ useLocation: () => ["/arenas", navigate] }));
vi.mock("@/pages/VerificationWorkflow", () => ({
  AdminVerificationWorkspace: () => null,
  ArenaRegistrationWorkflow: () => null,
  OwnerVerificationWorkspace: () => null,
}));

import { ArenaCard } from "./Home";

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

const arena = {
  id: "arena-7",
  name: "Northside Courts",
  locality: "Indiranagar",
  sport: "Badminton",
  price: "₹500",
  image: "https://example.com/court.jpg",
  slots: "4 slots",
  tone: "Verified",
};

describe("ArenaCard navigation", () => {
  it("opens the matching arena detail route when the card is clicked", () => {
    render(<ArenaCard arena={arena} showFavorite={false} />);

    fireEvent.click(screen.getByRole("link", { name: /open northside courts/i }));

    expect(navigate).toHaveBeenCalledWith("/arenas/arena-7");
  });

  it("opens the matching detail route through Enter and Space keyboard activation", () => {
    render(<ArenaCard arena={arena} showFavorite={false} />);
    const card = screen.getByRole("link", { name: /open northside courts/i });

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(navigate).toHaveBeenNthCalledWith(1, "/arenas/arena-7");
    expect(navigate).toHaveBeenNthCalledWith(2, "/arenas/arena-7");
  });
});
