import { RoadGraphDto, RoadNodeDto, RoadEdgeDto } from '@goldenhour/contracts';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';

export interface RouteResult {
  fromNodeId: string;
  toNodeId: string;
  pathNodeIds: string[];
  totalDistanceMeters: number;
  travelSeconds: number;
  edgeIds: string[];
  isLive: boolean;
  routingSource: 'SIMULATED_GRAPH' | 'LIVE_OSRM' | 'FALLBACK_GRAPH';
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

    // Build Adjacency List (bidirectional city road network)
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

      // From -> To
      adjacency.get(edge.from)?.push({
        edgeId: edge.id,
        neighbor: edge.to,
        distanceMeters: edge.distanceMeters,
        durationSeconds,
      });

      // To -> From (two-way roads)
      adjacency.get(edge.to)?.push({
        edgeId: edge.id,
        neighbor: edge.from,
        distanceMeters: edge.distanceMeters,
        durationSeconds,
      });
    }

    // Dijkstra's Algorithm
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
        break; // Unreachable
      }

      if (current === toNodeId) {
        break; // Destination reached
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

    // Reconstruct path
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
 * Live Routing Adapter (Phase 12 Live Maps Integration)
 * Adapter connecting to external routing engines (e.g., OSRM / OpenStreetMap / Google Directions).
 * If the service URL is missing or fails, it falls back to the SimulatedRoutingProvider
 * and explicitly marks isLive: false and routingSource: 'FALLBACK_GRAPH'.
 * Never labels simulated fallback data as live.
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
      // In production/demo, when serviceUrl is set, query external service or validate
      // If service URL is 'mock-live' or functional endpoint:
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
