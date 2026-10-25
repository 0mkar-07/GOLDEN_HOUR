import data from '../../../../packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json';
import { HospitalDto, ReceivingStatus, projectToNitkMetric } from '@goldenhour/contracts';

// Identity/coordinates come from the same source as the API importer, not legacy demos.
export const nitkHospitals: HospitalDto[] = data.facilities.map((facility) => {
  const lat = facility.location.latitude, lng = facility.location.longitude;
  const metric = projectToNitkMetric(lat, lng);
  return { id: `nitk:${facility.facility_id}`, code: facility.facility_id, name: facility.name,
    address: facility.address, location: { lat, lng, x: metric.x / 10, y: metric.y / 10 },
    capabilities: Object.keys(facility.capabilities), receivingStatus: ReceivingStatus.OPEN,
    receivingDelaySeconds: 120, version: 1, updatedAt: '2026-10-25T08:00:00Z' };
});
