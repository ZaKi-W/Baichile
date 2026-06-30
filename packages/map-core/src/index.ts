export type CoordSystem = 'gcj02' | 'wgs84' | 'bd09';

export interface GeoPoint {
  lat: number;
  lng: number;
  coordSystem: CoordSystem;
}

export interface VirtualRoute {
  id: string;
  cityCode: string;
  origin: GeoPoint;
  destination: GeoPoint;
  polyline: GeoPoint[];
  routeSource: 'prebuilt' | 'map-planning' | 'generated';
  label: '虚拟配送路线';
}

export type DeliveryStatus =
  | 'created'
  | 'merchant_accepted'
  | 'preparing'
  | 'rider_assigned'
  | 'picked_up'
  | 'delivering'
  | 'virtual_arrived'
  | 'completed';

const statusStops: Array<[number, DeliveryStatus]> = [
  [0.04, 'created'],
  [0.1, 'merchant_accepted'],
  [0.2, 'preparing'],
  [0.3, 'rider_assigned'],
  [0.4, 'picked_up'],
  [0.92, 'delivering'],
  [1, 'virtual_arrived'],
];

function segmentDistance(a: GeoPoint, b: GeoPoint): number {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y);
}

export function interpolateAlongPolyline(points: GeoPoint[], rawProgress: number): GeoPoint {
  if (points.length === 0) throw new Error('路线不能为空');
  if (points.length === 1) return points[0];
  const progress = Math.min(1, Math.max(0, rawProgress));
  const lengths = points.slice(1).map((point, index) => segmentDistance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return points[0];
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const ratio = lengths[index] === 0 ? 0 : remaining / lengths[index];
      return {
        lat: points[index].lat + (points[index + 1].lat - points[index].lat) * ratio,
        lng: points[index].lng + (points[index + 1].lng - points[index].lng) * ratio,
        coordSystem: points[index].coordSystem,
      };
    }
    remaining -= lengths[index];
  }
  return points.at(-1)!;
}

export function calculateDeliverySnapshot(nowMs: number, startedAtMs: number, durationMs: number) {
  if (durationMs <= 0) throw new Error('配送时长必须大于 0');
  const progress = Math.min(1, Math.max(0, (nowMs - startedAtMs) / durationMs));
  const status = progress >= 1
    ? 'completed'
    : statusStops.find(([upperBound]) => progress <= upperBound)?.[1] ?? 'delivering';
  return { progress, status, remainingMs: Math.max(0, startedAtMs + durationMs - nowMs) } as const;
}

