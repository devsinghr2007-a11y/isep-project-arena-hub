export type ArenaLocation = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  locality?: string | null;
  city?: string | null;
};

export type CurrentCoordinates = { latitude: number; longitude: number };

export function buildArenaDirectionsUrl(location: ArenaLocation): string {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const destination = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude},${longitude}`
    : [location.address, location.locality, location.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function buildCoordinateMapUrl(coordinates: CurrentCoordinates): string {
  return `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
}

export function requestCurrentCoordinates(geolocation: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation): Promise<CurrentCoordinates> {
  if (!geolocation) return Promise.reject(new Error("Location is not supported by this browser. Enter the coordinates manually."));
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location permission was denied. You can enter the coordinates manually." : "Unable to determine your current location. Try again or enter the coordinates manually.")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}
