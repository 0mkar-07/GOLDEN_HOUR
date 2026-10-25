// Isolated teaching data. Never submit these IDs to the NITK API.
export const LEGACY_HOSPITALS = [
  { id: 'ny-demo-a', role: 'A', name: 'St. Jude Metropolitan Trauma Center', x: 650, y: 140, lat: 40.725, lng: -73.990, specialist: true, travel: 18, intake: 2 },
  { id: 'ny-demo-b', role: 'B', name: 'Bayview Urgent Care & Community Hospital', x: 330, y: 330, lat: 40.710, lng: -74.010, specialist: false, travel: 7, intake: 1 },
  { id: 'ny-demo-c', role: 'C', name: 'Northpoint Regional Medical Center', x: 490, y: 230, lat: 40.718, lng: -74.000, specialist: false, travel: 11, intake: 3 },
] as const;

export type DemoPathway = 'SPECIALIST' | 'GENERAL' | 'STABILIZATION';
export function rankLegacyDemo(pathway: DemoPathway, traffic: number, theatreBReadyMinutes: number) {
  return LEGACY_HOSPITALS.map((hospital) => {
    const travel = hospital.travel * traffic;
    const ready = pathway === 'GENERAL' && hospital.role === 'B' ? theatreBReadyMinutes : 0;
    return { ...hospital, travel, eligible: pathway !== 'SPECIALIST' || hospital.specialist,
      timeToCare: Math.max(travel, ready) + hospital.intake };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.timeToCare - b.timeToCare || a.id.localeCompare(b.id));
}

export function demoRoute(hospital: { x: number; y: number }) {
  return [{ x: 100, y: 400 }, { x: 100, y: hospital.y }, { x: hospital.x, y: hospital.y }];
}

export function pointOnDemoRoute(points: { x: number; y: number }[], progress: number) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  let remaining = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const fraction = lengths[i] ? remaining / lengths[i] : 0;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * fraction,
        y: points[i].y + (points[i + 1].y - points[i].y) * fraction };
    }
    remaining -= lengths[i];
  }
  return points[points.length - 1];
}
