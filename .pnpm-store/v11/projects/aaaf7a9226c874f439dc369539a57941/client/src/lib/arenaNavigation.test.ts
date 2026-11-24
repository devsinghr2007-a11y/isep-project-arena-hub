import { describe, expect, it } from "vitest";
import { toArenaDetailPath } from "./arenaNavigation";

describe("toArenaDetailPath", () => {
  it("creates an arena detail path from the database identifier", () => {
    expect(toArenaDetailPath("c2a4df63-4a04-4e47-a071-17a2ae5f7b95")).toBe("/arenas/c2a4df63-4a04-4e47-a071-17a2ae5f7b95");
  });

  it("returns to discovery instead of opening a placeholder route when an identifier is absent", () => {
    expect(toArenaDetailPath()).toBe("/arenas");
  });
});
