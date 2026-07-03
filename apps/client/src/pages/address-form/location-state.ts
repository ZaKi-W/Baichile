import type { PlaceSuggestion } from '@baichile/api-contract';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type AreaNames = {
  province: string;
  city: string;
  district: string;
  address?: string;
};

export function locationSelection(coordinates: Coordinates, area: AreaNames) {
  const parts = area.city === area.province
    ? [area.province, area.district]
    : [area.province, area.city, area.district];
  return {
    lat: coordinates.latitude,
    lng: coordinates.longitude,
    address: area.address?.trim() || parts.filter(Boolean).join(''),
  };
}

export function placeSelection(place: PlaceSuggestion) {
  return {
    address: place.title,
    lat: place.lat,
    lng: place.lng,
    nearbyList: [] as PlaceSuggestion[],
  };
}
