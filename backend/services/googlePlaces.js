const normaliseName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isSameVenue = (requestedName, foundName) => {
  const requested = normaliseName(requestedName);
  const found = normaliseName(foundName);
  return requested.length > 2 && found.length > 2 && (requested.includes(found) || found.includes(requested));
};

// Uses Google Places Text Search to confirm that a named arena is present at
// the submitted location. A failed lookup stays pending for manual review;
// it must never be automatically approved on an uncertain result.
const verifyArenaOnGoogleMaps = async ({ name, address, city }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return { verified: false, reason: 'Google Maps verification is not configured.' };
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus',
      },
      body: JSON.stringify({
        textQuery: `${name}, ${address}, ${city}`,
        maxResultCount: 5,
        languageCode: 'en',
        regionCode: process.env.GOOGLE_MAPS_REGION || 'IN',
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      console.error('Google Places verification failed:', response.status);
      return { verified: false, reason: 'Google Maps could not verify this arena.' };
    }

    const { places = [] } = await response.json();
    const match = places.find((place) => (
      place.location
      && place.businessStatus !== 'CLOSED_PERMANENTLY'
      && isSameVenue(name, place.displayName?.text)
    ));

    if (!match) {
      return { verified: false, reason: 'No matching active arena was found on Google Maps.' };
    }

    return {
      verified: true,
      placeId: match.id,
      formattedAddress: match.formattedAddress,
      lat: match.location.latitude,
      lng: match.location.longitude,
      reason: 'Arena location verified with Google Maps and approved automatically.',
    };
  } catch (error) {
    console.error('Google Places verification error:', error.message);
    return { verified: false, reason: 'Google Maps could not verify this arena.' };
  }
};

module.exports = { verifyArenaOnGoogleMaps };
