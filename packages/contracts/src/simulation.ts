import { z } from 'zod';

export const RoadNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  lat: z.number(),
  lng: z.number(),
});

export type RoadNodeDto = z.infer<typeof RoadNodeSchema>;

export const RoadEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  distanceMeters: z.number().positive(),
  speedKmh: z.number().positive().default(50),
  baseTravelSeconds: z.number().positive(),
  trafficMultiplier: z.number().positive().default(1.0),
});

export type RoadEdgeDto = z.infer<typeof RoadEdgeSchema>;

export const RoadGraphSchema = z.object({
  nodes: z.array(RoadNodeSchema),
  edges: z.array(RoadEdgeSchema),
});

export type RoadGraphDto = z.infer<typeof RoadGraphSchema>;

export const SimulationRunSchema = z.object({
  id: z.string(),
  seed: z.string(),
  running: z.boolean(),
  speedMultiplier: z.number().positive().default(1),
  simulatedSeconds: z.number().nonnegative().default(0),
  scenarioStep: z.string().default('INITIAL'),
  updatedAt: z.string(),
});

export type SimulationRunDto = z.infer<typeof SimulationRunSchema>;
