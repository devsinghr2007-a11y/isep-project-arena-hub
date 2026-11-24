// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return {
    register: vi.fn(),
    passwordReset: vi.fn(),
    toast,
  };
});

vi.mock("@/lib/api", () => ({ api: { login: vi.fn(), register: mocks.register, verifyEmail: vi.fn(), resendEmailVerification: vi.fn(), passwordReset: mocks.passwordReset } }));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { LoginPage } from "./Home";

afterEach(() => {
  cleanup();
  mocks.register.mockReset();
  mocks.passwordReset.mockReset();
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("ArenaHub account screen", () => {
  it("switches into sign-up mode and submits an API registration request", async () => {
    mocks.register.mockResolvedValue({ message: "Verification code sent." });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));

    expect(screen.getByRole("heading", { name: "Create your account." })).toBeTruthy();
    await user.type(screen.getByLabelText("Full name"), "Priya Shah");
    await user.type(screen.getByLabelText("Email"), "priya@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: "Create ArenaHub account" }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    expect(mocks.register).toHaveBeenCalledWith("Priya Shah", "priya@example.com", "correct-horse-battery-staple");
    expect(mocks.toast.success).toHaveBeenCalledWith("Verification code sent");
    expect(screen.getByRole("heading", { name: "Confirm your email." })).toBeTruthy();
  });

  it("requests a password-reset email from the login screen and confirms the outcome", async () => {
    mocks.passwordReset.mockResolvedValue({ message: "Reset queued" });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "priya@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));

    await waitFor(() => expect(mocks.passwordReset).toHaveBeenCalledTimes(1));
    expect(mocks.passwordReset).toHaveBeenCalledWith("priya@example.com");
    expect(mocks.toast.success).toHaveBeenCalledWith("Reset queued");
  });
});
