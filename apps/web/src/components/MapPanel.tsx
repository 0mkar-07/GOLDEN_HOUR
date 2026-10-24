import React, { useState } from 'react';
import {
  HospitalDto,
  AmbulancePositionDto,
  RecommendationDto,
  SharedRouteDto,
  RoadGraphDto,
} from '@goldenhour/contracts';
import { LiveMap } from './LiveMap';
import { RoadNetworkMap } from './RoadNetworkMap';
import { Map, Layers, Radio } from 'lucide-react';

const DEFAULT_FALLBACK_GRAPH: RoadGraphDto = {
  nodes: [
    { id: 'node-amb-start', label: 'Highway Incident', x: 120, y: 150, lat: 40.71, lng: -74.02 },
    { id: 'node-jct-1', label: 'Westside Expressway', x: 200, y: 160, lat: 40.711, lng: -74.012 },
    { id: 'node-jct-2', label: 'Central Midtown', x: 300, y: 160, lat: 40.713, lng: -74.005 },
    { id: 'node-hosp-a', label: 'St. Jude Trauma Bay', x: 350, y: 150, lat: 40.7128, lng: -74.006 },
    { id: 'node-hosp-b', label: 'Bayview Slip', x: 150, y: 220, lat: 40.7088, lng: -74.015 },
  ],
  edges: [
    { id: 'edge-1', from: 'node-amb-start', to: 'node-jct-1', distanceMeters: 1000, speedKmh: 50, baseTravelSeconds: 72, trafficMultiplier: 1.0 },
    { id: 'edge-2', from: 'node-jct-1', to: 'node-jct-2', distanceMeters: 1200, speedKmh: 50, baseTravelSeconds: 86, trafficMultiplier: 1.0 },
    { id: 'edge-3', from: 'node-jct-2', to: 'node-hosp-a', distanceMeters: 800, speedKmh: 40, baseTravelSeconds: 72, trafficMultiplier: 1.0 },
    { id: 'edge-4', from: 'node-jct-1', to: 'node-hosp-b', distanceMeters: 1400, speedKmh: 45, baseTravelSeconds: 112, trafficMultiplier: 1.0 },
  ],
};

interface MapPanelProps {
  hospitals: HospitalDto[];
  selectedHospitalId?: string | null;
  onSelectHospital?: (hospitalId: string) => void;
  ambulancePosition: AmbulancePositionDto;
  recommendation?: RecommendationDto | null;
  confirmedHospitalId?: string | null;
  routes?: Record<string, SharedRouteDto>;
  graph?: RoadGraphDto;
  isSharingGps?: boolean;
  onToggleShareGps?: () => void;
  className?: string;
}

export const MapPanel: React.FC<MapPanelProps> = (props) => {
  const [mapMode, setMapMode] = useState<'GEOGRAPHIC' | 'SIMULATED'>('GEOGRAPHIC');

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Map Mode Selector Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#172B2A] uppercase tracking-wider flex items-center gap-1.5">
            <Map className="w-4 h-4 text-[#176B68]" />
            Geographic Road Tracking
          </span>
          <span className="text-[11px] text-[#596B69] hidden sm:inline">
            • Real-time ambulance ETA & hospital access
          </span>
        </div>

        {/* View Switcher Pill */}
        <div className="flex items-center bg-white border border-[#DCE5E3] rounded-lg p-0.5 text-xs shadow-xs">
          <button
            onClick={() => setMapMode('GEOGRAPHIC')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              mapMode === 'GEOGRAPHIC'
                ? 'bg-[#174C49] text-white shadow-xs'
                : 'text-[#596B69] hover:text-[#172B2A]'
            }`}
          >
            Live Geographic Map
          </button>
          <button
            onClick={() => setMapMode('SIMULATED')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              mapMode === 'SIMULATED'
                ? 'bg-[#174C49] text-white shadow-xs'
                : 'text-[#596B69] hover:text-[#172B2A]'
            }`}
          >
            Simulated Graph
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 w-full min-h-[460px]">
        {mapMode === 'GEOGRAPHIC' ? (
          <LiveMap {...props} />
        ) : (
          <div className="w-full h-full border border-[#DCE5E3] rounded-2xl overflow-hidden bg-white">
            <RoadNetworkMap
              graph={props.graph || DEFAULT_FALLBACK_GRAPH}
              ambulancePosition={props.ambulancePosition}
              hospitals={props.hospitals}
              recommendation={props.recommendation ?? null}
              onSelectHospital={props.onSelectHospital}
              trafficOverrides={{}}
            />
          </div>
        )}
      </div>
    </div>
  );
};
