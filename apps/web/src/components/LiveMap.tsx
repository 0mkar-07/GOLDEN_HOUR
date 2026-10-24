import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  HospitalDto,
  AmbulancePositionDto,
  RecommendationDto,
  SharedRouteDto,
} from '@goldenhour/contracts';
import {
  Navigation,
  Compass,
  Crosshair,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  Radio,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
} from 'lucide-react';

interface LiveMapProps {
  hospitals?: HospitalDto[];
  selectedHospitalId?: string | null;
  onSelectHospital?: (hospitalId: string) => void;
  ambulancePosition?: AmbulancePositionDto;
  recommendation?: RecommendationDto | null;
  confirmedHospitalId?: string | null;
  routes?: Record<string, SharedRouteDto>;
  isSharingGps?: boolean;
  onToggleShareGps?: () => void;
  className?: string;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  hospitals = [],
  selectedHospitalId,
  onSelectHospital,
  ambulancePosition,
  recommendation,
  confirmedHospitalId,
  routes = {},
  isSharingGps = false,
  onToggleShareGps,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followAmbulance, setFollowAmbulance] = useState<boolean>(true);
  const [inspectedHospital, setInspectedHospital] = useState<HospitalDto | null>(null);

  // Derive safe coordinates for ambulance (supporting lat/lng, x/y, or default)
  const ambLat = ambulancePosition?.lat ?? (ambulancePosition?.y ? 40.70 + (ambulancePosition.y / 1000) : 40.7128);
  const ambLng = ambulancePosition?.lng ?? (ambulancePosition?.x ? -74.01 + (ambulancePosition.x / 1000) : -74.0060);

  // Compute geographic bounding box across all hospitals and ambulance
  const geoBounds = useMemo(() => {
    let minLat = ambLat;
    let maxLat = ambLat;
    let minLng = ambLng;
    let maxLng = ambLng;

    for (const h of (hospitals || [])) {
      const hLat = h.location?.lat ?? (h.location?.y ? 40.70 + (h.location.y / 1000) : null);
      const hLng = h.location?.lng ?? (h.location?.x ? -74.01 + (h.location.x / 1000) : null);
      if (hLat !== null && !isNaN(hLat)) {
        minLat = Math.min(minLat, hLat);
        maxLat = Math.max(maxLat, hLat);
      }
      if (hLng !== null && !isNaN(hLng)) {
        minLng = Math.min(minLng, hLng);
        maxLng = Math.max(maxLng, hLng);
      }
    }

    // Add padding to margins
    const latPadding = Math.max(0.015, (maxLat - minLat) * 0.25);
    const lngPadding = Math.max(0.02, (maxLng - minLng) * 0.25);

    return {
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLng: minLng - lngPadding,
      maxLng: maxLng + lngPadding,
    };
  }, [hospitals, ambLat, ambLng]);

  // Project geographic { lat, lng } to internal SVG canvas space (width: 800, height: 500)
  const project = (lat: number, lng: number): { x: number; y: number } => {
    const normX = (lng - geoBounds.minLng) / (geoBounds.maxLng - geoBounds.minLng || 1);
    // Invert latitude for SVG Y axis (north is up)
    const normY = 1 - (lat - geoBounds.minLat) / (geoBounds.maxLat - geoBounds.minLat || 1);

    return {
      x: 40 + normX * 720,
      y: 40 + normY * 420,
    };
  };

  const ambPoint = project(ambLat, ambLng);

  // Auto-follow ambulance position
  useEffect(() => {
    if (followAmbulance) {
      setPan({ x: 0, y: 0 });
    }
  }, [ambLat, ambLng, followAmbulance]);

  // Mouse drag handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    setFollowAmbulance(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleFitBounds = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFollowAmbulance(true);
  };

  // Determine active route to render
  const primaryHospitalId = confirmedHospitalId || recommendation?.hospitalA?.hospitalId;
  const primaryRoute = primaryHospitalId ? routes[primaryHospitalId] : null;
  const backupBRoute = recommendation?.hospitalB?.hospitalId ? routes[recommendation.hospitalB.hospitalId] : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[420px] bg-[#F6F8F8] border border-[#DCE5E3] rounded-2xl overflow-hidden flex flex-col select-none ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Map Status HUD Strip */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Source & Provenance Pill */}
        <div className="flex items-center gap-2 pointer-events-auto bg-white/95 backdrop-blur border border-[#DCE5E3] rounded-xl px-3 py-1.5 shadow-sm text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#172B2A]">
            <Radio className="w-3.5 h-3.5 text-[#176B68] animate-pulse" />
            <span>
              {ambulancePosition?.source === 'DEVICE_GPS' ? 'Device GPS Telemetry' : 'Simulated Vehicle Position'}
            </span>
          </div>

          <span className="text-[#DCE5E3]">|</span>

          <span className="text-[11px] text-[#596B69]">
            {primaryRoute?.routingSource === 'GOOGLE_ROUTES'
              ? 'Google Routes API (Live Traffic)'
              : primaryRoute?.routingSource === 'LIVE_OSRM'
              ? 'Live OSRM Router'
              : 'Road Network Geometry'}
          </span>
        </div>

        {/* Map Control Toolbar */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-white/95 backdrop-blur border border-[#DCE5E3] rounded-xl p-1 shadow-sm text-xs">
          {onToggleShareGps && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleShareGps();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                isSharingGps
                  ? 'bg-[#174C49] text-white'
                  : 'bg-[#F6F8F8] text-[#176B68] hover:bg-[#EAF5F2]'
              }`}
              title="Toggle Browser Device GPS Location Tracking"
            >
              <Navigation className="w-3 h-3" />
              {isSharingGps ? 'GPS Active' : 'Share Device GPS'}
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setFollowAmbulance(!followAmbulance);
            }}
            className={`p-1.5 rounded-lg border transition-colors ${
              followAmbulance
                ? 'bg-[#EAF5F2] border-[#176B68] text-[#176B68]'
                : 'border-transparent text-[#596B69] hover:bg-[#F6F8F8]'
            }`}
            title="Follow Ambulance Position"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.min(2.5, z + 0.25));
            }}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-[#F6F8F8] hover:text-[#172B2A]"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.max(0.6, z - 0.25));
            }}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-[#F6F8F8] hover:text-[#172B2A]"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFitBounds();
            }}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-[#F6F8F8] hover:text-[#172B2A]"
            title="Fit All Facilities"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Map Surface */}
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing"
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Background Grid Pattern */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E6EFEF" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#grid)" />

          {/* Secondary / Backup B Route Line (Subtle Teal Dashed) */}
          {backupBRoute && backupBRoute.pathCoordinates.length > 1 && (
            <polyline
              points={backupBRoute.pathCoordinates
                .map((pt) => {
                  const p = project(pt.lat, pt.lng);
                  return `${p.x},${p.y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#889B99"
              strokeWidth="2.5"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          )}

          {/* Primary Route Line (Rich Brand Teal #176B68) */}
          {primaryRoute && primaryRoute.pathCoordinates.length > 1 && (
            <polyline
              points={primaryRoute.pathCoordinates
                .map((pt) => {
                  const p = project(pt.lat, pt.lng);
                  return `${p.x},${p.y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#176B68"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hospital Markers */}
          {(hospitals || []).map((hosp) => {
            const hLat = hosp.location?.lat ?? (hosp.location?.y ? 40.70 + (hosp.location.y / 1000) : 40.7128);
            const hLng = hosp.location?.lng ?? (hosp.location?.x ? -74.01 + (hosp.location.x / 1000) : -74.0060);
            const pos = project(hLat, hLng);
            const isA = hosp.id === recommendation?.hospitalA?.hospitalId;
            const isB = hosp.id === recommendation?.hospitalB?.hospitalId;
            const isC = hosp.id === recommendation?.hospitalC?.hospitalId;
            const isConfirmed = hosp.id === confirmedHospitalId;
            const isSelected = hosp.id === selectedHospitalId;

            let badgeLetter = isA ? 'A' : isB ? 'B' : isC ? 'C' : 'H';
            let bgFill = isConfirmed
              ? '#174C49'
              : isA
              ? '#176B68'
              : isB
              ? '#2E8B87'
              : '#FFFFFF';
            let textFill = isA || isB || isConfirmed ? '#FFFFFF' : '#172B2A';
            let strokeColor = isConfirmed ? '#0F3331' : isA ? '#135552' : '#DCE5E3';

            return (
              <g
                key={hosp.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer transition-transform hover:scale-110"
                onClick={(e) => {
                  e.stopPropagation();
                  setInspectedHospital(hosp);
                  if (onSelectHospital) onSelectHospital(hosp.id);
                }}
              >
                {/* Selection Halo */}
                {isSelected && (
                  <circle r="26" fill="#176B68" fillOpacity="0.15" stroke="#176B68" strokeWidth="2" strokeDasharray="4 4" />
                )}

                {/* Confirmed Destination Halo */}
                {isConfirmed && (
                  <circle r="22" fill="#EAF5F2" stroke="#174C49" strokeWidth="2" />
                )}

                {/* Main Pin Base */}
                <circle
                  r="16"
                  fill={bgFill}
                  stroke={strokeColor}
                  strokeWidth="2"
                  filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.1))"
                />

                {/* Role / Letter Badge */}
                <text
                  x="0"
                  y="5"
                  textAnchor="middle"
                  fill={textFill}
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                >
                  {badgeLetter}
                </text>

                {/* Hospital Label */}
                <g transform="translate(0, 28)">
                  <rect
                    x={-((hosp.name.length * 6.5) / 2 + 8)}
                    y="-12"
                    width={hosp.name.length * 6.5 + 16}
                    height="18"
                    rx="4"
                    fill="#FFFFFF"
                    stroke="#DCE5E3"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="1"
                    textAnchor="middle"
                    fill="#172B2A"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {hosp.name}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Ambulance Marker */}
          <g transform={`translate(${ambPoint.x}, ${ambPoint.y})`}>
            {/* Live GPS pulse indicator */}
            <circle r="22" fill="#176B68" fillOpacity="0.15">
              <animate attributeName="r" values="16;28;16" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
            </circle>

            {/* Vehicle Direction Icon */}
            <g transform={`rotate(${ambulancePosition?.heading || 0})`}>
              <circle
                r="14"
                fill="#174C49"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.2))"
              />
              <path d="M 0 -8 L 5 4 L 0 2 L -5 4 Z" fill="#FFFFFF" />
            </g>

            {/* Unit Tag */}
            <g transform="translate(0, -22)">
              <rect x="-26" y="-10" width="52" height="16" rx="4" fill="#174C49" />
              <text
                x="0"
                y="2"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9"
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
              >
                Medic 4
              </text>
            </g>
          </g>
        </g>
      </svg>

      {/* Floating Hospital Inspection Drawer */}
      {inspectedHospital && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-96 z-20 bg-white border border-[#DCE5E3] rounded-2xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between border-b border-[#DCE5E3] pb-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EAF5F2] text-[#176B68]">
                  {inspectedHospital.code}
                </span>
                <h4 className="font-bold text-sm text-[#172B2A]">{inspectedHospital.name}</h4>
              </div>
              <p className="text-[11px] text-[#596B69] mt-0.5">{inspectedHospital.address}</p>
            </div>
            <button
              onClick={() => setInspectedHospital(null)}
              className="p-1 rounded-lg text-[#596B69] hover:bg-[#F6F8F8]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="py-2.5 space-y-2 text-xs">
            <div className="flex justify-between items-center text-[#596B69]">
              <span>Receiving Status:</span>
              <span className="font-semibold text-[#237048]">{inspectedHospital.receivingStatus}</span>
            </div>
            <div className="flex justify-between items-center text-[#596B69]">
              <span>Receiving Intake Delay:</span>
              <span className="font-medium text-[#172B2A]">
                +{Math.round(inspectedHospital.receivingDelaySeconds / 60)} mins
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#596B69]">Capabilities:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {inspectedHospital.capabilities.map((c) => (
                  <span
                    key={c}
                    className="px-1.5 py-0.5 rounded bg-[#F6F8F8] border border-[#DCE5E3] text-[10px] font-medium text-[#172B2A]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#DCE5E3] text-[10px] text-[#596B69] italic">
            * Clicking a facility inspects hospital clinical readiness. It does not initiate dispatch or lock equipment.
          </div>
        </div>
      )}
    </div>
  );
};
