import type { FilteredLocation } from "../shared/relay";

export function isOnVisibleHemisphere(
  location: Pick<FilteredLocation, "longitude" | "latitude">,
  center: { readonly lng: number; readonly lat: number },
) {
  const latitude = toRadians(location.latitude);
  const centerLatitude = toRadians(center.lat);
  const longitudeDelta = toRadians(location.longitude - center.lng);
  const cosine =
    Math.sin(latitude) * Math.sin(centerLatitude) +
    Math.cos(latitude) * Math.cos(centerLatitude) * Math.cos(longitudeDelta);

  return cosine > 0;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
