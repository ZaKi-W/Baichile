import type { AdministrativeArea, PlaceSuggestion } from '@baichile/api-contract';
import { requestApi } from './http';

export async function reverseGeocode(lat: number, lng: number): Promise<AdministrativeArea> {
  return requestApi<AdministrativeArea>('GET', `/v1/map/reverse-geocode?lat=${lat}&lng=${lng}`, '');
}

export async function nearbyPlaces(lat: number, lng: number): Promise<PlaceSuggestion[]> {
  return requestApi<PlaceSuggestion[]>('GET', `/v1/map/nearby?lat=${lat}&lng=${lng}`, '');
}

export async function suggestPlaces(keyword: string, region?: string): Promise<PlaceSuggestion[]> {
  if (!keyword?.trim()) return [];
  const params = new URLSearchParams({ keyword: keyword.trim() });
  if (region) params.set('region', region);
  return requestApi<PlaceSuggestion[]>('GET', `/v1/map/suggest?${params.toString()}`, '');
}
