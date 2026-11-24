import { describe, expect, it, vi } from "vitest";
import { registerWithEmail, requestPasswordReset } from "./accountAuth";

const mocks = vi.hoisted(() => ({ register: vi.fn(), passwordReset: vi.fn() }));
vi.mock("./api", () => ({ api: mocks }));

describe("ArenaHub account actions", () => {
  it("sends a normalized registration request to the ArenaHub API", async () => {
    mocks.register.mockResolvedValue({ user: {} });

    await registerWithEmail({
      fullName: "  Priya Shah  ",
      email: "  priya@example.com ",
      password: "correct-horse-battery-staple",
      redirectTo: "https://arenahub.example/login",
    });

    expect(mocks.register).toHaveBeenCalledWith("Priya Shah", "priya@example.com", "correct-horse-battery-staple");
  });

  it("sends a normalized password-reset request to the ArenaHub login route", async () => {
    mocks.passwordReset.mockResolvedValue({ message: "Reset queued" });

    await requestPasswordReset("  priya@example.com ", "https://arenahub.example/login");

    expect(mocks.passwordReset).toHaveBeenCalledWith("priya@example.com");
  });
});
