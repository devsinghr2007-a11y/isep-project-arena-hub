import { describe, expect, it } from "vitest";

describe("ArenaHub public Supabase configuration", () => {
  it("reaches the configured Supabase Auth settings endpoint with the publishable key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    expect(url).toMatch(/^https:\/\//);
    expect(key).toBeTruthy();

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: key as string,
      },
    });

    expect(response.ok).toBe(true);
  }, 20_000);
});
