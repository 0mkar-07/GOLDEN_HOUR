import React from 'react';
import {
  RoadGraphDto,
  AmbulancePositionDto,
  RecommendationDto,
  HospitalDto,
} from '@goldenhour/contracts';
import { Navigation, Building2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface RoadNetworkMapProps {
  graph: RoadGraphDto;
  ambulancePosition: AmbulancePositionDto;
  recommendation: RecommendationDto | null;
  hospitals: HospitalDto[];
  trafficOverrides?: Record<string, number>;
  onSelectHospital?: (hospitalId: string) => void;
}

export const RoadNetworkMap: React.FC<RoadNetworkMapProps> = ({
  graph,
  ambulancePosition,
  recommendation,
  hospitals,
  trafficOverrides = {},
  onSelectHospital,
}) => {
  const primaryA = recommendation?.hospitalA;
  const backupB = recommendation?.hospitalB;
  const backupC = recommendation?.hospitalC;

  // Find Hospital coordinates
  const getHospLoc = (hospId?: string) => {
    const h = hospitals.find((item) => item.id === hospId);
    return h ? h.location : null;
  };

  const hospALoc = getHospLoc(primaryA?.hospitalId);
  const hospBLoc = getHospLoc(backupB?.hospitalId);
  const hospCLoc = getHospLoc(backupC?.hospitalId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Live City Transit Map (Road Graph)</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            Primary Route (A)
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            Standby Backups (B & C)
          </span>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <div className="relative w-full h-[360px] bg-slate-950 rounded-xl border border-slate-850 overflow-hidden flex items-center justify-center">
        <svg
          viewBox="40 40 480 370"
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle Grid Pattern */}
          <defs>
            <pattern id="city-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#city-grid)" />

          {/* Road Network Edges */}
          {graph.edges.map((edge) => {
            const fromNode = graph.nodes.find((n) => n.id === edge.from);
            const toNode = graph.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const traffic = trafficOverrides[edge.id] || edge.trafficMultiplier || 1.0;
            const isCongested = traffic > 1.5;

            return (
              <g key={edge.id} className="transition-all">
                {/* Road Casing */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={isCongested ? '#dc2626' : '#334155'}
                  strokeWidth={isCongested ? 7 : 5}
                  strokeLinecap="round"
                  strokeOpacity={isCongested ? 0.9 : 0.7}
                />
                {/* Road Lane Center Line */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={isCongested ? '#fca5a5' : '#64748b'}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              </g>
            );
          })}

          {/* Dotted Standby Arcs from Current Ambulance Position to Backups B & C */}
          {hospBLoc && (
            <line
              x1={ambulancePosition.x}
              y1={ambulancePosition.y}
              x2={hospBLoc.x}
              y2={hospBLoc.y}
              stroke="#fbbf24"
              strokeWidth={2.5}
              strokeDasharray="6 6"
              strokeOpacity={0.8}
            />
          )}

          {hospCLoc && (
            <line
              x1={ambulancePosition.x}
              y1={ambulancePosition.y}
              x2={hospCLoc.x}
              y2={hospCLoc.y}
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />
          )}

          {/* Primary Route Ribbon to Hospital A */}
          {hospALoc && (
            <line
              x1={ambulancePosition.x}
              y1={ambulancePosition.y}
              x2={hospALoc.x}
              y2={hospALoc.y}
              stroke="#ef4444"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="8 4"
              className="animate-pulse"
            />
          )}

          {/* Road Network Nodes */}
          {graph.nodes.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={3}
              fill="#475569"
            />
          ))}

          {/* 5 Hospitals */}
          {hospitals.map((hosp) => {
            const isPrimary = hosp.id === primaryA?.hospitalId;
            const isBackupB = hosp.id === backupB?.hospitalId;
            const isBackupC = hosp.id === backupC?.hospitalId;

            const badgeBg = isPrimary
              ? '#ef4444'
              : isBackupB || isBackupC
              ? '#f59e0b'
              : '#3b82f6';

            return (
              <g
                key={hosp.id}
                onClick={() => onSelectHospital && onSelectHospital(hosp.id)}
                className="cursor-pointer group"
              >
                {/* Hospital Pin Beacon */}
                <circle
                  cx={hosp.location.x}
                  cy={hosp.location.y}
                  r={isPrimary ? 16 : 12}
                  fill={badgeBg}
                  fillOpacity={0.2}
                  className={isPrimary ? 'animate-ping' : ''}
                />
                <circle
                  cx={hosp.location.x}
                  cy={hosp.location.y}
                  r={isPrimary ? 9 : 7}
                  fill={badgeBg}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />

                {/* Hospital Code Badge */}
                <rect
                  x={hosp.location.x - 22}
                  y={hosp.location.y - 25}
                  width={44}
                  height={15}
                  rx={4}
                  fill="#0f172a"
                  stroke={badgeBg}
                  strokeWidth={1.5}
                />
                <text
                  x={hosp.location.x}
                  y={hosp.location.y - 14}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={8}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {hosp.code}
                </text>
              </g>
            );
          })}

          {/* Ambulance Live Location Marker */}
          <g>
            {/* Pulse Ring */}
            <circle
              cx={ambulancePosition.x}
              cy={ambulancePosition.y}
              r={18}
              fill="#ef4444"
              fillOpacity={0.25}
              className="animate-ping"
            />
            {/* Ambulance Marker */}
            <circle
              cx={ambulancePosition.x}
              cy={ambulancePosition.y}
              r={10}
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth={2}
            />
            <text
              x={ambulancePosition.x}
              y={ambulancePosition.y + 3.5}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={9}
              fontWeight="bold"
            >
              🚑
            </text>
            <rect
              x={ambulancePosition.x - 24}
              y={ambulancePosition.y + 14}
              width={48}
              height={14}
              rx={3}
              fill="#1e293b"
              stroke="#ef4444"
              strokeWidth={1}
            />
            <text
              x={ambulancePosition.x}
              y={ambulancePosition.y + 24}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={7.5}
              fontWeight="bold"
              fontFamily="monospace"
            >
              UNIT-104
            </text>
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-1">
        <span>Click any facility marker to inspect capabilities and readiness.</span>
        <span className="font-mono text-slate-400">
          Ambulance Position: [{ambulancePosition.x}, {ambulancePosition.y}]
        </span>
      </div>
    </div>
  );
};
