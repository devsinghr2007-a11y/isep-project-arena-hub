import { describe, expect, it, vi } from "vitest";
import { buildArenaDirectionsUrl, buildCoordinateMapUrl, requestCurrentCoordinates } from "./arenaLocation";

describe("arena location helpers", () => {
  it("builds Google Maps directions from exact coordinates or the stored address", () => {
    expect(buildArenaDirectionsUrl({ latitude: 12.9352, longitude: 77.6245 })).toBe("https://www.google.com/maps/dir/?api=1&destination=12.9352%2C77.6245");
    expect(buildArenaDirectionsUrl({ address: "1 Court Road", locality: "HSR Layout", city: "Bengaluru" })).toContain("1%20Court%20Road%2C%20HSR%20Layout%2C%20Bengaluru");
    expect(buildCoordinateMapUrl({ latitude: 12.9, longitude: 77.6 })).toBe("https://www.google.com/maps?q=12.9,77.6");
  });

  it("returns browser coordinates and explains when location is unavailable", async () => {
    const geo = { getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 12.93, longitude: 77.61 } })) } as unknown as Geolocation;
    const denied = { getCurrentPosition: vi.fn((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1 })) } as unknown as Geolocation;
    await expect(requestCurrentCoordinates(geo)).resolves.toEqual({ latitude: 12.93, longitude: 77.61 });
    await expect(requestCurrentCoordinates(undefined)).rejects.toThrow(/not supported/i);
    await expect(requestCurrentCoordinates(denied)).rejects.toThrow(/permission was denied/i);
  });
});
