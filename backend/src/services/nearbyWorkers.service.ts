const MAX_PROXIMITY_RADIUS_KM = 50;
const KM_PER_LATITUDE_DEGREE = 110.574;
const KM_PER_LONGITUDE_DEGREE_AT_EQUATOR = 111.32;

type CoordinateBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  crossesAntimeridian: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeLongitude = (value: number) => {
  let normalized = value;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
};

export const getProximityBounds = (lat: number, lng: number, radiusKm: number): CoordinateBounds => {
  const radius = clamp(radiusKm, 1, MAX_PROXIMITY_RADIUS_KM);
  const latDelta = radius / KM_PER_LATITUDE_DEGREE;
  const minLat = clamp(lat - latDelta, -90, 90);
  const maxLat = clamp(lat + latDelta, -90, 90);
  const latitudeRadians = (lat * Math.PI) / 180;
  const cosLatitude = Math.max(Math.abs(Math.cos(latitudeRadians)), 0.01);
  const lngDelta = radius / (KM_PER_LONGITUDE_DEGREE_AT_EQUATOR * cosLatitude);

  if (lngDelta >= 180) {
    return {
      minLat,
      maxLat,
      minLng: -180,
      maxLng: 180,
      crossesAntimeridian: false,
    };
  }

  const rawMinLng = lng - lngDelta;
  const rawMaxLng = lng + lngDelta;

  return {
    minLat,
    maxLat,
    minLng: normalizeLongitude(rawMinLng),
    maxLng: normalizeLongitude(rawMaxLng),
    crossesAntimeridian: rawMinLng < -180 || rawMaxLng > 180,
  };
};

export const getWorkerBoundsFilter = (bounds: CoordinateBounds) => ({
  sql: bounds.crossesAntimeridian
    ? `AND wp.latitude BETWEEN ? AND ?
       AND (wp.longitude >= ? OR wp.longitude <= ?)`
    : `AND wp.latitude BETWEEN ? AND ?
       AND wp.longitude BETWEEN ? AND ?`,
  params: [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng],
});
