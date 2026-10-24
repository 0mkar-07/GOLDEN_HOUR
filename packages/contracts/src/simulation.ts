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
  runVersion: z.number().int().positive().default(1),
  assignedAmbulanceId: z.string().default('amb-104'),
  activeCaseId: z.string().nullable().optional(),
  completed: z.boolean().default(false),
  checkpointCount: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});

export type SimulationRunDto = z.infer<typeof SimulationRunSchema>;

export const DirectedSegmentSchema = z.object({
  edgeId: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  lengthMeters: z.number().positive(),
  speedKmh: z.number().positive(),
  progressMeters: z.number().nonnegative(),
  remainingMeters: z.number().nonnegative(),
});

export type DirectedSegmentDto = z.infer<typeof DirectedSegmentSchema>;

export const SimulationPlayRequestSchema = z.object({
  speedMultiplier: z.number().min(0.5).max(10).default(1.0),
  expectedRunVersion: z.number().int().positive().optional(),
});
export type SimulationPlayRequest = z.infer<typeof SimulationPlayRequestSchema>;

export const SimulationStepRequestSchema = z.object({
  stepSeconds: z.number().positive().max(60).default(5),
  expectedRunVersion: z.number().int().positive().optional(),
});
export type SimulationStepRequest = z.infer<typeof SimulationStepRequestSchema>;

export const SimulationSpeedRequestSchema = z.object({
  speedMultiplier: z.number().min(0.5).max(10),
  expectedRunVersion: z.number().int().positive().optional(),
});
export type SimulationSpeedRequest = z.infer<typeof SimulationSpeedRequestSchema>;

export const SimulationTrafficRequestSchema = z.object({
  edgeId: z.string(),
  multiplier: z.number().min(1.0).max(10.0),
  expectedRunVersion: z.number().int().positive().optional(),
});
export type SimulationTrafficRequest = z.infer<typeof SimulationTrafficRequestSchema>;

export const SimulationResetRequestSchema = z.object({
  mode: z.enum(['REWIND', 'SCENARIO_RESET']).default('REWIND'),
  expectedRunVersion: z.number().int().positive().optional(),
});
export type SimulationResetRequest = z.infer<typeof SimulationResetRequestSchema>;

export const SourceSwitchRequestSchema = z.object({
  ambulanceId: z.string(),
  targetSource: z.enum(['SIMULATED', 'DEVICE_GPS', 'REPLAY']),
  expectedSequence: z.number().int().nonnegative().optional(),
});
export type SourceSwitchRequest = z.infer<typeof SourceSwitchRequestSchema>;

export const OriginPreviewRequestSchema = z.object({
  runId: z.string().optional(),
  requested: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  expectedRunVersion: z.number().int().positive().optional(),
  clientRequestId: z.string().optional(),
});
export type OriginPreviewRequest = z.infer<typeof OriginPreviewRequestSchema>;

export const OriginPreviewResponseSchema = z.object({
  clientRequestId: z.string().optional(),
  validationId: z.string(),
  expiresAt: z.string(),
  runId: z.string(),
  runVersion: z.number(),
  regionVersion: z.string(),
  graphVersion: z.string(),
  requested: z.object({ lat: z.number(), lng: z.number() }),
  resolved: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  roadSegmentId: z.string().nullable().optional(),
  segmentFraction: z.number().nullable().optional(),
  snapDistanceMeters: z.number().nullable().optional(),
  distanceFromNitkKm: z.number().nullable().optional(),
  validationStatus: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionCode: z
    .enum(['OUT_OF_REGION', 'NO_ROAD_ACCESS', 'INVALID_COORDINATES', 'EXPIRED_PREVIEW', 'DISALLOWED_RUN_STATE'])
    .nullable()
    .optional(),
  rejectionReason: z.string().nullable().optional(),
});
export type OriginPreviewResponse = z.infer<typeof OriginPreviewResponseSchema>;

export const OriginCommitRequestSchema = z.object({
  runId: z.string().optional(),
  validationId: z.string().optional(),
  requested: z.object({ lat: z.number(), lng: z.number() }).optional(),
  expectedRunVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
});
export type OriginCommitRequest = z.infer<typeof OriginCommitRequestSchema>;
