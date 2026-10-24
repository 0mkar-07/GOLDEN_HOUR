import { describe, it, expect } from 'vitest';
import { SEEDED_HOSPITALS, SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';

describe('Stage 2: NITK Surathkal Regional Geography Dataset', () => {
  it('centers regional geography around NITK Surathkal and Mangaluru corridor', () => {
    // NITK Surathkal reference latitude ~13.011, longitude ~74.794
    const startNode = SEEDED_ROAD_GRAPH.nodes.find((n) => n.id === 'node-amb-start');
    expect(startNode).toBeDefined();
    expect(startNode!.lat).toBeCloseTo(13.011, 2);
    expect(startNode!.lng).toBeCloseTo(74.794, 2);
    expect(startNode!.label).toContain('NITK');
  });

  it('places all 5 hospitals strictly on land along the NH 66 coastal corridor, east of Arabian Sea', () => {
    // Arabian Sea coastline at Surathkal is around lng 74.785 - 74.788
    // All medical facilities and arrival entrances must be on land (lng >= 74.786, lat 12.85 - 13.05)
    for (const hospital of SEEDED_HOSPITALS) {
      expect(hospital.location.lat).toBeGreaterThan(12.85);
      expect(hospital.location.lat).toBeLessThan(13.05);
      expect(hospital.location.lng).toBeGreaterThan(74.785);
      expect(hospital.location.lng).toBeLessThan(74.86);
      expect(hospital.address).toContain('Karnataka');
    }
  });

  it('connects road network nodes to reviewed vehicle entrances without disconnected points', () => {
    const nodeIds = new Set(SEEDED_ROAD_GRAPH.nodes.map((n) => n.id));

    // Every edge must reference valid node IDs
    for (const edge of SEEDED_ROAD_GRAPH.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
      expect(edge.distanceMeters).toBeGreaterThan(0);
      expect(edge.baseTravelSeconds).toBeGreaterThan(0);
    }

    // Every hospital node must have at least one incoming or outgoing edge
    const hospitalNodes = ['node-hosp-a', 'node-hosp-b', 'node-hosp-c', 'node-hosp-d', 'node-hosp-e'];
    for (const hNode of hospitalNodes) {
      const connected = SEEDED_ROAD_GRAPH.edges.some((e) => e.from === hNode || e.to === hNode);
      expect(connected).toBe(true);
    }
  });
});
