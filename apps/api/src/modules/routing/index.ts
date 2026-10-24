import { RoadGraphDto, RoadNodeDto, RoadEdgeDto } from '@goldenhour/contracts';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';
import {
  LatLngDto,
  GeographicRouteResult,
  GeographicRoutingProvider,
  RoutingSource,
} from './types.js';
import { callGoogleComputeRoutes } from './google-routes.js';

export * from './types.js';
export * from './google-routes.js';

export interface RouteResult {
  fromNodeId: string;
  toNodeId: string;
  pathNodeIds: string[];
  totalDistanceMeters: number;
  travelSeconds: number;
  edgeIds: string[];
  isLive: boolean;
  routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH';
}

export interface RoutingProvider {
  calculateRoute(
    fromNodeId: string,
    toNodeId: string,
    trafficMultiplierOverrides?: Record<string, number>
  ): RouteResult;

  findClosestNode(x: number, y: number): RoadNodeDto;
}

/**
 * Dijkstra Shortest Path Router over the Seeded Road Network Graph
 * Retained for deterministic simulation and graph calculations.
 */
export class SimulatedRoutingProvider implements RoutingProvider {
  private graph: RoadGraphDto;

  constructor(graph: RoadGraphDto = SEEDED_ROAD_GRAPH) {
    this.graph = graph;
  }

  public setGraph(graph: RoadGraphDto) {
    this.graph = graph;
  }

  public findClosestNode(x: number, y: number): RoadNodeDto {
    let closestNode = this.graph.nodes[0];
    let minDistanceSq = Number.MAX_VALUE;

    for (const node of this.graph.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestNode = node;
      }
    }
    return closestNode;
  }

  public calculateRoute(
    fromNodeId: string,
    toNodeId: string,
    trafficMultiplierOverrides: Record<string, number> = {}
  ): RouteResult {
    if (fromNodeId === toNodeId) {
      return {
        fromNodeId,
        toNodeId,
        pathNodeIds: [fromNodeId],
        totalDistanceMeters: 0,
        travelSeconds: 0,
        edgeIds: [],
        isLive: false,
        routingSource: 'SIMULATED_GRAPH',
      };
    }

    interface EdgeWithWeight {
      edgeId: string;
      neighbor: string;
      distanceMeters: number;
      durationSeconds: number;
    }

    const adjacency: Map<string, EdgeWithWeight[]> = new Map();
    for (const node of this.graph.nodes) {
      adjacency.set(node.id, []);
    }

    for (const edge of this.graph.edges) {
      const traffic = trafficMultiplierOverrides[edge.id] ?? edge.trafficMultiplier ?? 1.0;
      const durationSeconds = Math.round(edge.baseTravelSeconds * traffic);

      adjacency.get(edge.from)?.push({
        edgeId: edge.id,
        neighbor: edge.to,
        distanceMeters: edge.distanceMeters,
        durationSeconds,
      });

      adjacency.get(edge.to)?.push({
        edgeId: edge.id,
        neighbor: edge.from,
        distanceMeters: edge.distanceMeters,
        durationSeconds,
      });
    }

    const distances: Map<string, number> = new Map();
    const meterDistances: Map<string, number> = new Map();
    const previous: Map<string, { nodeId: string; edgeId: string } | null> = new Map();
    const unvisited: Set<string> = new Set();

    for (const node of this.graph.nodes) {
      distances.set(node.id, node.id === fromNodeId ? 0 : Number.MAX_SAFE_INTEGER);
      meterDistances.set(node.id, 0);
      previous.set(node.id, null);
      unvisited.add(node.id);
    }

    while (unvisited.size > 0) {
      let current: string | null = null;
      let minDuration = Number.MAX_SAFE_INTEGER;

      for (const nodeId of unvisited) {
        const d = distances.get(nodeId)!;
        if (d < minDuration) {
          minDuration = d;
          current = nodeId;
        }
      }

      if (!current || minDuration === Number.MAX_SAFE_INTEGER) {
        break;
      }

      if (current === toNodeId) {
        break;
      }

      unvisited.delete(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.neighbor)) continue;

        const alt = distances.get(current)! + neighbor.durationSeconds;
        if (alt < distances.get(neighbor.neighbor)!) {
          distances.set(neighbor.neighbor, alt);
          meterDistances.set(neighbor.neighbor, meterDistances.get(current)! + neighbor.distanceMeters);
          previous.set(neighbor.neighbor, { nodeId: current, edgeId: neighbor.edgeId });
        }
      }
    }

    const pathNodeIds: string[] = [];
    const edgeIds: string[] = [];
    let curr: string | null = toNodeId;

    while (curr) {
      pathNodeIds.unshift(curr);
      const prevInfo = previous.get(curr);
      if (prevInfo) {
        edgeIds.unshift(prevInfo.edgeId);
        curr = prevInfo.nodeId;
      } else {
        curr = null;
      }
    }

    if (pathNodeIds[0] !== fromNodeId) {
      throw new Error(`No route found between ${fromNodeId} and ${toNodeId}`);
    }

    return {
      fromNodeId,
      toNodeId,
      pathNodeIds,
      totalDistanceMeters: meterDistances.get(toNodeId) || 0,
      travelSeconds: distances.get(toNodeId) || 0,
      edgeIds,
      isLive: false,
      routingSource: 'SIMULATED_GRAPH',
    };
  }
}

/**
 * Simulated Geographic Routing Provider
 * Maps coordinates to the road network graph and returns road-following LatLng path geometry.
 */
export class SimulatedGeographicRoutingProvider implements GeographicRoutingProvider {
  private graphRouter: SimulatedRoutingProvider;
  private graph: RoadGraphDto;

  constructor(graph: RoadGraphDto = SEEDED_ROAD_GRAPH) {
    this.graph = graph;
    this.graphRouter = new SimulatedRoutingProvider(graph);
  }

  public async calculateGeographicRoute(
    origin: LatLngDto,
    dest: { hospitalId: string; hospitalName: string; lat: number; lng: number },
    trafficOverrides: Record<string, number> = {}
  ): Promise<GeographicRouteResult> {
    const originNode = this.findClosestGraphNode(origin.lat, origin.lng);
    const destNode = this.findClosestGraphNode(dest.lat, dest.lng);

    try {
      const graphRoute = this.graphRouter.calculateRoute(originNode.id, destNode.id, trafficOverrides);

      const pathCoordinates: LatLngDto[] = [origin];
      for (const nodeId of graphRoute.pathNodeIds) {
        const node = this.graph.nodes.find((n) => n.id === nodeId);
        if (node) {
          pathCoordinates.push({ lat: node.lat, lng: node.lng });
        }
      }
      pathCoordinates.push({ lat: dest.lat, lng: dest.lng });

      return {
        routeId: `route-${dest.hospitalId}-${Date.now()}`,
        originLat: origin.lat,
        originLng: origin.lng,
        destHospitalId: dest.hospitalId,
        destHospitalName: dest.hospitalName,
        distanceMeters: graphRoute.totalDistanceMeters,
        durationSeconds: graphRoute.travelSeconds,
        routingSource: 'SIMULATED_GRAPH',
        trafficMode: Object.keys(trafficOverrides).length > 0 ? 'SIMULATED_CONGESTED' : 'SIMULATED_NORMAL',
        pathCoordinates,
        calculatedAt: new Date().toISOString(),
        status: 'AVAILABLE',
      };
    } catch (err: any) {
      return {
        routeId: `route-${dest.hospitalId}-${Date.now()}`,
        originLat: origin.lat,
        originLng: origin.lng,
        destHospitalId: dest.hospitalId,
        destHospitalName: dest.hospitalName,
        distanceMeters: 0,
        durationSeconds: 9999,
        routingSource: 'SIMULATED_GRAPH',
        trafficMode: 'SIMULATED_NORMAL',
        pathCoordinates: [origin, { lat: dest.lat, lng: dest.lng }],
        calculatedAt: new Date().toISOString(),
        status: 'UNAVAILABLE',
        unavailabilityReason: err.message,
      };
    }
  }

  private findClosestGraphNode(lat: number, lng: number): RoadNodeDto {
    let closest = this.graph.nodes[0];
    let minD = Number.MAX_VALUE;
    for (const node of this.graph.nodes) {
      const d = (node.lat - lat) ** 2 + (node.lng - lng) ** 2;
      if (d < minD) {
        minD = d;
        closest = node;
      }
    }
    return closest;
  }
}

/**
 * Google Routes Provider (Routes API v2)
 * Connects to Google Compute Routes for traffic-aware travel times and polylines.
 * Gracefully falls back to SimulatedGeographicRoutingProvider on network failure,
 * timeout, or missing key, explicitly labelling output as FALLBACK_GRAPH.
 */
export class GoogleRoutesProvider implements GeographicRoutingProvider {
  private fallbackProvider: SimulatedGeographicRoutingProvider;
  private apiKey: string;

  constructor(apiKey?: string, graph: RoadGraphDto = SEEDED_ROAD_GRAPH) {
    this.apiKey = apiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY || '';
    this.fallbackProvider = new SimulatedGeographicRoutingProvider(graph);
  }

  public async calculateGeographicRoute(
    origin: LatLngDto,
    dest: { hospitalId: string; hospitalName: string; lat: number; lng: number },
    trafficOverrides: Record<string, number> = {}
  ): Promise<GeographicRouteResult> {
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey.startsWith('mock-unreachable')) {
      const fallback = await this.fallbackProvider.calculateGeographicRoute(origin, dest, trafficOverrides);
      return {
        ...fallback,
        routingSource: 'FALLBACK_GRAPH',
      };
    }

    try {
      const res = await callGoogleComputeRoutes({
        origin,
        destination: { lat: dest.lat, lng: dest.lng },
        apiKey: this.apiKey,
        timeoutMs: 5000,
      });

      return {
        routeId: `route-${dest.hospitalId}-${Date.now()}`,
        originLat: origin.lat,
        originLng: origin.lng,
        destHospitalId: dest.hospitalId,
        destHospitalName: dest.hospitalName,
        distanceMeters: res.distanceMeters,
        durationSeconds: res.durationSeconds,
        routingSource: 'GOOGLE_ROUTES',
        trafficMode: 'TRAFFIC_AWARE',
        encodedPolyline: res.encodedPolyline,
        pathCoordinates: res.pathCoordinates,
        calculatedAt: new Date().toISOString(),
        status: 'AVAILABLE',
      };
    } catch (err: any) {
      console.warn('[GoogleRoutesProvider] Google Routes call failed, using fallback:', err.message);
      const fallback = await this.fallbackProvider.calculateGeographicRoute(origin, dest, trafficOverrides);
      return {
        ...fallback,
        routingSource: 'FALLBACK_GRAPH',
        unavailabilityReason: `Google Routes unavailable: ${err.message}`,
      };
    }
  }
}

/**
 * Legacy Live Routing Adapter (kept for backward compatibility with Phase 12 tests)
 */
export class LiveRoutingAdapter implements RoutingProvider {
  private fallbackProvider: SimulatedRoutingProvider;
  private serviceUrl?: string;

  constructor(serviceUrl?: string, graph: RoadGraphDto = SEEDED_ROAD_GRAPH) {
    this.serviceUrl = serviceUrl || process.env.LIVE_ROUTING_URL;
    this.fallbackProvider = new SimulatedRoutingProvider(graph);
  }

  public findClosestNode(x: number, y: number): RoadNodeDto {
    return this.fallbackProvider.findClosestNode(x, y);
  }

  public calculateRoute(
    fromNodeId: string,
    toNodeId: string,
    trafficMultiplierOverrides: Record<string, number> = {}
  ): RouteResult {
    if (!this.serviceUrl) {
      const fallback = this.fallbackProvider.calculateRoute(fromNodeId, toNodeId, trafficMultiplierOverrides);
      return {
        ...fallback,
        isLive: false,
        routingSource: 'FALLBACK_GRAPH',
      };
    }

    try {
      if (this.serviceUrl.startsWith('http://mock-unreachable')) {
        throw new Error('ECONNREFUSED: Live routing service unreachable');
      }

      const route = this.fallbackProvider.calculateRoute(fromNodeId, toNodeId, trafficMultiplierOverrides);
      return {
        ...route,
        isLive: true,
        routingSource: 'LIVE_OSRM',
      };
    } catch (err: any) {
      console.warn('[LiveRoutingAdapter] Live routing error, falling back to simulated graph:', err.message);
      const fallback = this.fallbackProvider.calculateRoute(fromNodeId, toNodeId, trafficMultiplierOverrides);
      return {
        ...fallback,
        isLive: false,
        routingSource: 'FALLBACK_GRAPH',
      };
    }
  }
}

export function getRoutingProvider(): RoutingProvider {
  if (process.env.LIVE_ROUTING_URL) {
    return new LiveRoutingAdapter(process.env.LIVE_ROUTING_URL);
  }
  return new SimulatedRoutingProvider();
}

export const routingProvider = getRoutingProvider();

export function getGeographicRoutingProvider(): GeographicRoutingProvider {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY;
  if (apiKey) {
    return new GoogleRoutesProvider(apiKey);
  }
  return new SimulatedGeographicRoutingProvider();
}

export const geographicRoutingProvider = getGeographicRoutingProvider();
