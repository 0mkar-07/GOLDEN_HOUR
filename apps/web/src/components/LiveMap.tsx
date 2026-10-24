import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  HospitalDto,
  AmbulancePositionDto,
  RecommendationDto,
  SharedRouteDto,
} from '@goldenhour/contracts';
import { apiClient } from '../lib/api-client';
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
  Gauge,
  Flame,
  CheckCircle2,
  Building2,
  Car,
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

export type PinState = 'IDLE' | 'PICKING' | 'VALIDATING' | 'READY_TO_CONFIRM' | 'SAVING' | 'CONFIRMED' | 'ERROR';

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
  const googleMapDivRef = useRef<HTMLDivElement>(null);

  // Google Maps Instance References
  const googleMapInstance = useRef<any>(null);
  const trafficLayerInstance = useRef<any>(null);
  const ambulanceMarkerRef = useRef<any>(null);
  const hospitalMarkersRef = useRef<Map<string, any>>(new Map());
  const routePolylinesRef = useRef<any[]>([]);

  // State
  const [googleMapsReady, setGoogleMapsReady] = useState<boolean>(false);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [followAmbulance, setFollowAmbulance] = useState<boolean>(true);
  const [inspectedHospital, setInspectedHospital] = useState<HospitalDto | null>(null);
  const [pinPlacementMode, setPinPlacementMode] = useState<boolean>(false);
  const [originFeedback, setOriginFeedback] = useState<string | null>(null);

  // Pin Placement State Machine (Stage 6 / F-11)
  // IDLE -> PICKING -> VALIDATING -> READY_TO_CONFIRM -> SAVING -> CONFIRMED / ERROR
  const [pinState, setPinState] = useState<PinState>('IDLE');
  const pinStateRef = useRef<PinState>('IDLE');
  pinStateRef.current = pinState;

  const [draftOrigin, setDraftOrigin] = useState<{
    requested: { lat: number; lng: number };
    resolved: { lat: number; lng: number } | null;
    validationId?: string;
    snapDistanceMeters?: number;
    distanceFromNitkKm?: number;
    error?: string;
  } | null>(null);
  const draftMarkerRef = useRef<any>(null);

  // Canvas Fallback State (when Google JS is unavailable or offline)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Safe coordinates (NITK Surathkal region default)
  const ambLat = ambulancePosition?.lat ?? 13.0110;
  const ambLng = ambulancePosition?.lng ?? 74.7943;
  const ambHeading = ambulancePosition?.heading ?? 85;
  const ambSpeed = ambulancePosition?.speed ?? 0;

  // Freshness calculation (Stage 3.4): fresh if <= 15s old, stale if > 15s
  const isFresh = useMemo(() => {
    if (!ambulancePosition?.observedAt) return true;
    const ageSeconds = (Date.now() - new Date(ambulancePosition.observedAt).getTime()) / 1000;
    return ageSeconds <= 15;
  }, [ambulancePosition?.observedAt]);

  // Determine active primary route and backup route
  const primaryHospitalId = confirmedHospitalId || recommendation?.hospitalA?.hospitalId;
  const primaryRoute = primaryHospitalId ? routes[primaryHospitalId] : null;
  const backupBRoute = recommendation?.hospitalB?.hospitalId ? routes[recommendation.hospitalB.hospitalId] : null;

  // 1. Load Google Maps JavaScript API (Stage 3.1)
  useEffect(() => {
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || typeof window === 'undefined') {
      return;
    }

    if ((window as any).google?.maps) {
      setGoogleMapsReady(true);
      return;
    }

    const scriptId = 'goldenhour-google-maps-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => setGoogleMapsReady(true);
      script.onerror = () => setGoogleMapsReady(false);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', () => setGoogleMapsReady(true));
    }
  }, []);

  // 2. Initialize Google Map Instance
  useEffect(() => {
    if (!googleMapsReady || !googleMapDivRef.current || googleMapInstance.current) {
      return;
    }

    try {
      const map = new (window as any).google.maps.Map(googleMapDivRef.current, {
        center: { lat: ambLat, lng: ambLng },
        zoom: 14,
        mapTypeId: mapTypeId,
        disableDefaultUI: true,
        zoomControl: false,
        styles: [
          { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
          { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        ],
      });

      // Traffic layer
      const traffic = new (window as any).google.maps.TrafficLayer();
      if (showTraffic) {
        traffic.setMap(map);
      }
      trafficLayerInstance.current = traffic;
      googleMapInstance.current = map;

      // Draw 40 km regional boundary circle around NITK Surathkal (NITK_REGION)
      new (window as any).google.maps.Circle({
        strokeColor: '#059669',
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
        fillColor: '#10b981',
        fillOpacity: 0.04,
        map,
        center: { lat: 13.0108, lng: 74.7936 },
        radius: 40000,
      });

      // Click listener for ambulance pin placement: Only active in PICKING/READY_TO_CONFIRM state (F-11 / Stage 6)
      map.addListener('click', async (e: any) => {
        if (pinStateRef.current !== 'PICKING' && pinStateRef.current !== 'READY_TO_CONFIRM' && pinStateRef.current !== 'ERROR') {
          return; // Ordinary clicks, hospital clicks, and pans do NOT mutate origin!
        }
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        setPinState('VALIDATING');
        setOriginFeedback('Validating road access and 40 km boundary...');

        try {
          const preview = await apiClient.previewSimulationOrigin(lat, lng);
          if (preview.validationStatus === 'ACCEPTED' && preview.resolved) {
            setDraftOrigin({
              requested: preview.requested,
              resolved: preview.resolved,
              validationId: preview.validationId,
              snapDistanceMeters: preview.snapDistanceMeters ?? undefined,
              distanceFromNitkKm: preview.distanceFromNitkKm ?? undefined,
            });
            setPinState('READY_TO_CONFIRM');
            setOriginFeedback(
              `Draft pin: ${preview.distanceFromNitkKm}km from NITK (${preview.snapDistanceMeters}m road snap). Click 'Confirm Origin Pin' to commit.`
            );
          } else {
            setDraftOrigin({
              requested: { lat, lng },
              resolved: null,
              error: preview.rejectionReason || 'Point outside 40 km boundary or no road access within 50m',
            });
            setPinState('ERROR');
            setOriginFeedback(preview.rejectionReason || 'Cannot place origin here');
          }
        } catch (err: any) {
          setPinState('ERROR');
          setOriginFeedback(err.message || 'Validation failed');
        }
      });

      // Handle user manual pan: suspend follow
      map.addListener('dragstart', () => {
        setFollowAmbulance(false);
      });
    } catch (e) {
      console.warn('Google Maps initialization failed, falling back to canvas:', e);
      setGoogleMapsReady(false);
    }
  }, [googleMapsReady]);

  // 3. Update Traffic Layer & Map Type
  useEffect(() => {
    if (!googleMapInstance.current) return;
    googleMapInstance.current.setMapTypeId(mapTypeId);
    if (trafficLayerInstance.current) {
      trafficLayerInstance.current.setMap(showTraffic ? googleMapInstance.current : null);
    }
  }, [mapTypeId, showTraffic]);

  // 4. Update Google Map Markers & Route Polylines
  useEffect(() => {
    if (!googleMapInstance.current || !(window as any).google?.maps) return;
    const map = googleMapInstance.current;
    const google = (window as any).google;

    // Update or create Ambulance Marker
    const ambSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="21" fill="#176B68" fill-opacity="0.25"/>
        <circle cx="23" cy="23" r="15" fill="#174C49" stroke="#FFFFFF" stroke-width="2.5"/>
        <g transform="rotate(${ambHeading} 23 23)">
          <polygon points="23,10 28,26 23,23 18,26" fill="#FFFFFF"/>
        </g>
      </svg>
    `)}`;

    if (!ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current = new google.maps.Marker({
        position: { lat: ambLat, lng: ambLng },
        map,
        title: 'Medic 4 (AMB-104)',
        icon: {
          url: ambSvg,
          scaledSize: new google.maps.Size(46, 46),
          anchor: new google.maps.Point(23, 23),
        },
        zIndex: 999,
      });
    } else {
      ambulanceMarkerRef.current.setPosition({ lat: ambLat, lng: ambLng });
      ambulanceMarkerRef.current.setIcon({
        url: ambSvg,
        scaledSize: new google.maps.Size(46, 46),
        anchor: new google.maps.Point(23, 23),
      });
    }

    if (followAmbulance) {
      map.panTo({ lat: ambLat, lng: ambLng });
    }

    // Update Hospital Markers
    const currentMarkerMap = hospitalMarkersRef.current;
    hospitals.forEach((hosp) => {
      const hLat = hosp.location?.lat ?? 13.0108;
      const hLng = hosp.location?.lng ?? 74.7936;
      const isA = hosp.id === recommendation?.hospitalA?.hospitalId;
      const isB = hosp.id === recommendation?.hospitalB?.hospitalId;
      const isC = hosp.id === recommendation?.hospitalC?.hospitalId;
      const isConfirmed = hosp.id === confirmedHospitalId;

      const markerColor = isConfirmed || isA ? '#059669' : isB ? '#D97706' : isC ? '#7C3AED' : '#596B69';
      const roleBadge = isConfirmed ? 'CONFIRMED' : isA ? 'A' : isB ? 'B' : isC ? 'C' : 'H';

      const hospSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <defs>
            <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
            </filter>
          </defs>
          <path d="M18 0 C8 0 0 8 0 18 C0 30 18 44 18 44 C18 44 36 30 36 18 C36 8 28 0 18 0 Z" fill="${markerColor}" filter="url(#sh)"/>
          <circle cx="18" cy="17" r="13" fill="#FFFFFF"/>
          <text x="18" y="22" font-family="system-ui, sans-serif" font-size="11" font-weight="900" fill="${markerColor}" text-anchor="middle">${roleBadge.slice(0, 1)}</text>
        </svg>
      `)}`;

      let marker = currentMarkerMap.get(hosp.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: hLat, lng: hLng },
          map,
          title: hosp.name,
          icon: {
            url: hospSvg,
            scaledSize: new google.maps.Size(36, 44),
            anchor: new google.maps.Point(18, 44),
          },
        });
        marker.addListener('click', () => {
          onSelectHospital?.(hosp.id);
          setInspectedHospital(hosp);
        });
        currentMarkerMap.set(hosp.id, marker);
      } else {
        marker.setPosition({ lat: hLat, lng: hLng });
      }
    });

    // Remove old polylines
    routePolylinesRef.current.forEach((pl) => pl.setMap(null));
    routePolylinesRef.current = [];

    // Render Primary Route Polyline (Apollo Teal)
    if (primaryRoute && primaryRoute.status === 'AVAILABLE' && primaryRoute.pathCoordinates.length > 1) {
      const primaryPolyline = new google.maps.Polyline({
        path: primaryRoute.pathCoordinates.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
        geodesic: true,
        strokeColor: '#176B68',
        strokeOpacity: 0.9,
        strokeWeight: 6,
        map,
      });
      routePolylinesRef.current.push(primaryPolyline);
    }

    // Render Backup Route Polyline (Dashed Amber)
    if (backupBRoute && backupBRoute.status === 'AVAILABLE' && backupBRoute.pathCoordinates.length > 1) {
      const backupPolyline = new google.maps.Polyline({
        path: backupBRoute.pathCoordinates.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
        geodesic: true,
        strokeColor: '#D97706',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
          offset: '0',
          repeat: '15px',
        }],
        map,
      });
      routePolylinesRef.current.push(backupPolyline);
    }

    // Render Draft Origin Pin if present (Stage 6)
    if (draftOrigin && (window as any).google?.maps) {
      const draftLat = draftOrigin.resolved ? draftOrigin.resolved.lat : draftOrigin.requested.lat;
      const draftLng = draftOrigin.resolved ? draftOrigin.resolved.lng : draftOrigin.requested.lng;
      const isAccepted = Boolean(draftOrigin.resolved);
      const draftSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <circle cx="18" cy="18" r="16" fill="${isAccepted ? '#10b981' : '#ef4444'}" fill-opacity="0.3" stroke="${isAccepted ? '#059669' : '#dc2626'}" stroke-width="2" stroke-dasharray="4,4"/>
          <path d="M18 6 C13 6 8 11 8 18 C8 26 18 38 18 38 C18 38 28 26 28 18 C28 11 23 6 18 6 Z" fill="${isAccepted ? '#059669' : '#dc2626'}"/>
          <circle cx="18" cy="17" r="5" fill="#FFFFFF"/>
        </svg>
      `)}`;
      if (!draftMarkerRef.current) {
        draftMarkerRef.current = new google.maps.Marker({
          position: { lat: draftLat, lng: draftLng },
          map,
          icon: {
            url: draftSvg,
            scaledSize: new google.maps.Size(36, 44),
            anchor: new google.maps.Point(18, 44),
          },
          title: isAccepted ? `Draft Pin: ${draftOrigin.distanceFromNitkKm}km from NITK` : 'Draft Pin (Invalid / Off-road)',
        });
      } else {
        draftMarkerRef.current.setMap(map);
        draftMarkerRef.current.setPosition({ lat: draftLat, lng: draftLng });
        draftMarkerRef.current.setIcon({
          url: draftSvg,
          scaledSize: new google.maps.Size(36, 44),
          anchor: new google.maps.Point(18, 44),
        });
      }
    } else if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
      draftMarkerRef.current = null;
    }
  }, [googleMapsReady, ambLat, ambLng, ambHeading, hospitals, primaryRoute, backupBRoute, followAmbulance, confirmedHospitalId, recommendation, draftOrigin]);

  // Recenter Google Map on Ambulance
  const handleRecenterGoogle = () => {
    setFollowAmbulance(true);
    if (googleMapInstance.current) {
      googleMapInstance.current.panTo({ lat: ambLat, lng: ambLng });
      googleMapInstance.current.setZoom(15);
    }
  };

  // Fit All Facilities in Google Map
  const handleFitBoundsGoogle = () => {
    setFollowAmbulance(false);
    if (!googleMapInstance.current || !(window as any).google?.maps) return;
    const bounds = new (window as any).google.maps.LatLngBounds();
    bounds.extend({ lat: ambLat, lng: ambLng });
    hospitals.forEach((h) => {
      bounds.extend({ lat: h.location?.lat ?? 13.0110, lng: h.location?.lng ?? 74.7943 });
    });
    googleMapInstance.current.fitBounds(bounds, 50);
  };

  // Confirm and commit validated ambulance origin (Stage 6)
  const handleConfirmOrigin = async () => {
    if (!draftOrigin || !draftOrigin.resolved) return;
    setPinState('SAVING');
    try {
      const res = await apiClient.setSimulationOrigin(draftOrigin.resolved.lat, draftOrigin.resolved.lng, {
        validationId: draftOrigin.validationId,
      });
      setPinState('CONFIRMED');
      setOriginFeedback(`Start pin confirmed: ${res.distanceFromNitkKm}km from NITK (${res.snapDistanceMeters}m road snap)`);
      setDraftOrigin(null);
      setPinPlacementMode(false);
      setTimeout(() => {
        setPinState('IDLE');
        setOriginFeedback(null);
      }, 4000);
    } catch (err: any) {
      setPinState('ERROR');
      setOriginFeedback(err.message || 'Failed to confirm origin');
    }
  };

  const handleCancelPinPlacement = () => {
    setDraftOrigin(null);
    setPinState('IDLE');
    setPinPlacementMode(false);
    setOriginFeedback(null);
    if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
      draftMarkerRef.current = null;
    }
  };

  // --- Canvas Fallback Projections (When in Vitest / Offline) ---
  const geoBounds = useMemo(() => {
    let minLat = ambLat, maxLat = ambLat, minLng = ambLng, maxLng = ambLng;
    for (const h of hospitals) {
      const hLat = h.location?.lat ?? 13.0110;
      const hLng = h.location?.lng ?? 74.7943;
      minLat = Math.min(minLat, hLat);
      maxLat = Math.max(maxLat, hLat);
      minLng = Math.min(minLng, hLng);
      maxLng = Math.max(maxLng, hLng);
    }
    const latPadding = Math.max(0.015, (maxLat - minLat) * 0.25);
    const lngPadding = Math.max(0.02, (maxLng - minLng) * 0.25);
    return {
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLng: minLng - lngPadding,
      maxLng: maxLng + lngPadding,
    };
  }, [hospitals, ambLat, ambLng]);

  const project = (lat: number, lng: number): { x: number; y: number } => {
    const normX = (lng - geoBounds.minLng) / (geoBounds.maxLng - geoBounds.minLng || 1);
    const normY = 1 - (lat - geoBounds.minLat) / (geoBounds.maxLat - geoBounds.minLat || 1);
    return { x: 40 + normX * 720, y: 40 + normY * 420 };
  };

  const ambPoint = project(ambLat, ambLng);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[460px] bg-[#F6F8F8] border border-[#DCE5E3] rounded-2xl overflow-hidden flex flex-col select-none ${className}`}
    >
      {/* 1. Real Google Maps Container (Stage 3.1) */}
      <div
        ref={googleMapDivRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
          googleMapsReady ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 2. Top Status HUD Strip */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Source & Provenance Badge */}
        <div className="flex items-center gap-2 pointer-events-auto bg-white/95 backdrop-blur border border-[#DCE5E3] rounded-xl px-3 py-1.5 shadow-sm text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#172B2A]">
            <Radio
              className={`w-3.5 h-3.5 ${
                isFresh ? 'text-[#176B68] animate-pulse' : 'text-[#D97706]'
              }`}
            />
            <span>
              {ambulancePosition?.source === 'DEVICE_GPS' ? 'Device GPS Telemetry' : 'Simulated Vehicle Position'}
            </span>
          </div>

          <span className="text-[#DCE5E3]">|</span>

          <span className="text-[11px] font-medium text-[#596B69]">
            {primaryRoute?.routingSource === 'GOOGLE_ROUTES' ? (
              <span className="text-[#176B68] font-bold">Google Routes API (Live Traffic)</span>
            ) : googleMapsReady ? (
              'Google Maps Live Canvas'
            ) : (
              'Road Network Geometry'
            )}
          </span>

          {!isFresh && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold text-[10px]">
              Telemetry Stale
            </span>
          )}
        </div>

        {/* Map Control Toolbar */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-white/95 backdrop-blur border border-[#DCE5E3] rounded-xl p-1 shadow-sm text-xs">
          {/* Map Type Toggle */}
          {googleMapsReady && (
            <button
              onClick={() => setMapTypeId(mapTypeId === 'roadmap' ? 'satellite' : 'roadmap')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                mapTypeId === 'satellite'
                  ? 'bg-[#174C49] text-white border-transparent'
                  : 'bg-[#F6F8F8] text-[#172B2A] border-[#DCE5E3] hover:bg-[#EAF5F2]'
              }`}
              title="Toggle Satellite vs Street View"
            >
              {mapTypeId === 'satellite' ? 'Satellite' : 'Roadmap'}
            </button>
          )}

          {/* Traffic Toggle */}
          {googleMapsReady && (
            <button
              onClick={() => setShowTraffic(!showTraffic)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                showTraffic
                  ? 'bg-[#EAF5F2] border-[#176B68] text-[#176B68]'
                  : 'bg-[#F6F8F8] text-[#596B69] border-[#DCE5E3]'
              }`}
              title="Toggle Live Traffic Flow Layer"
            >
              <Flame className="w-3 h-3" />
              Traffic {showTraffic ? 'ON' : 'OFF'}
            </button>
          )}

          {/* Follow Ambulance */}
          <button
            onClick={() => {
              setFollowAmbulance(!followAmbulance);
              if (!followAmbulance && googleMapsReady) handleRecenterGoogle();
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

          {/* Recenter */}
          <button
            onClick={() => {
              if (googleMapsReady) handleRecenterGoogle();
              else {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setFollowAmbulance(true);
              }
            }}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-[#F6F8F8] hover:text-[#172B2A]"
            title="Recenter on Vehicle"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Fit All */}
          <button
            onClick={() => {
              if (googleMapsReady) handleFitBoundsGoogle();
              else {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }
            }}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-[#F6F8F8] hover:text-[#172B2A]"
            title="Fit All Facilities"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Choose Ambulance Start Pin (Stage 6) */}
          <button
            onClick={() => {
              if (pinPlacementMode) {
                handleCancelPinPlacement();
              } else {
                setPinPlacementMode(true);
                setPinState('PICKING');
                setFollowAmbulance(false);
                setOriginFeedback('Click map within 40 km to draft an ambulance start origin pin');
              }
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition ${
              pinPlacementMode
                ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400'
                : 'bg-[#F6F8F8] text-[#172B2A] border-[#DCE5E3] hover:bg-[#EAF5F2]'
            }`}
            title="Click map to choose ambulance start pin (40 km regional boundary)"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            {pinPlacementMode ? 'Cancel Pin' : 'Set Pin'}
          </button>

          {/* Reset to NITK Default */}
          <button
            onClick={async () => {
              try {
                handleCancelPinPlacement();
                await apiClient.resetSimulationOriginToDefault();
                setOriginFeedback('Ambulance origin reset to NITK Surathkal default (13.0108, 74.7936)');
                setTimeout(() => setOriginFeedback(null), 3500);
              } catch (err: any) {
                setOriginFeedback(err.message);
              }
            }}
            className="px-2 py-1 rounded-lg text-xs font-semibold bg-[#F6F8F8] text-[#596B69] border border-[#DCE5E3] hover:bg-[#EAF5F2] hover:text-[#172B2A] transition"
            title="Reset ambulance start to NITK default"
          >
            NITK Default
          </button>
        </div>
      </div>

      {/* Origin Pin Feedback Toast */}
      {originFeedback && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-xl border border-slate-700 shadow-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{originFeedback}</span>
        </div>
      )}

      {/* Draft Origin Action Confirmation Floating Bar (Stage 6) */}
      {draftOrigin && pinState === 'READY_TO_CONFIRM' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white px-4 py-3 rounded-2xl border border-amber-400 shadow-2xl flex items-center gap-4 animate-fade-in">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-amber-300">
              Draft Origin: {draftOrigin.distanceFromNitkKm} km from NITK
            </span>
            <span className="text-[10px] text-slate-300">
              Snapped {draftOrigin.snapDistanceMeters}m to road segment
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmOrigin}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition"
            >
              Confirm Origin Pin
            </button>
            <button
              onClick={handleCancelPinPlacement}
              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 3. Resilient Fallback Canvas (When Google Maps JS is loading, offline, or in test environment) */}
      {!googleMapsReady && (
        <svg
          className="w-full h-full cursor-grab active:cursor-grabbing flex-1"
          viewBox="0 0 800 500"
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={(e) => {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            setFollowAmbulance(false);
          }}
          onMouseMove={(e) => {
            if (!isDragging) return;
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Grid Pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E6EFEF" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#grid)" />

            {/* Secondary Route Line */}
            {backupBRoute && backupBRoute.pathCoordinates.length > 1 && (
              <polyline
                points={backupBRoute.pathCoordinates.map((pt) => `${project(pt.lat, pt.lng).x},${project(pt.lat, pt.lng).y}`).join(' ')}
                fill="none"
                stroke="#D97706"
                strokeWidth="2.5"
                strokeDasharray="6 6"
              />
            )}

            {/* Primary Route Line */}
            {primaryRoute && primaryRoute.pathCoordinates.length > 1 && (
              <polyline
                points={primaryRoute.pathCoordinates.map((pt) => `${project(pt.lat, pt.lng).x},${project(pt.lat, pt.lng).y}`).join(' ')}
                fill="none"
                stroke="#176B68"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Hospital Markers */}
            {hospitals.map((hosp) => {
              const hLat = hosp.location?.lat ?? 13.0110;
              const hLng = hosp.location?.lng ?? 74.7943;
              const pos = project(hLat, hLng);
              const isA = hosp.id === recommendation?.hospitalA?.hospitalId;
              const isB = hosp.id === recommendation?.hospitalB?.hospitalId;
              const isC = hosp.id === recommendation?.hospitalC?.hospitalId;
              const isConfirmed = hosp.id === confirmedHospitalId;

              const pinColor = isConfirmed || isA ? '#059669' : isB ? '#D97706' : isC ? '#7C3AED' : '#596B69';
              const roleText = isConfirmed ? 'CONFIRMED' : isA ? 'A' : isB ? 'B' : isC ? 'C' : 'H';

              return (
                <g
                  key={hosp.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer group"
                  onClick={() => {
                    onSelectHospital?.(hosp.id);
                    setInspectedHospital(hosp);
                  }}
                >
                  <circle cx="0" cy="0" r="14" fill={pinColor} />
                  <circle cx="0" cy="0" r="10" fill="#FFFFFF" />
                  <text x="0" y="4" textAnchor="middle" fontSize="10" fontWeight="bold" fill={pinColor}>
                    {roleText.slice(0, 1)}
                  </text>
                  <text
                    x="0"
                    y="24"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="#172B2A"
                    className="select-none filter drop-shadow-xs"
                  >
                    {hosp.name}
                  </text>
                </g>
              );
            })}

            {/* Ambulance Unit Marker */}
            <g transform={`translate(${ambPoint.x}, ${ambPoint.y})`}>
              <circle cx="0" cy="0" r="18" fill="#176B68" fillOpacity="0.2" className="animate-ping" />
              <circle cx="0" cy="0" r="12" fill="#174C49" stroke="#FFFFFF" strokeWidth="2.5" />
              <g transform={`rotate(${ambHeading})`}>
                <polygon points="0,-8 5,5 0,3 -5,5" fill="#FFFFFF" />
              </g>
              <text x="0" y="24" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#174C49">
                Medic 4
              </text>
            </g>
          </g>
        </svg>
      )}

      {/* 4. Bottom Floating Telemetry Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
        <div className="bg-white/95 backdrop-blur border border-[#DCE5E3] rounded-xl px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
          {/* Telemetry Numbers */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#172B2A]">
              <Gauge className="w-4 h-4 text-[#176B68]" />
              <span>{Math.round(ambSpeed)} km/h</span>
            </div>

            <div className="flex items-center gap-1.5 text-[#596B69]">
              <Compass className="w-4 h-4 text-[#176B68]" />
              <span>{Math.round(ambHeading)}°</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-[#596B69]">
              <span>{ambLat.toFixed(4)}°N</span>
              <span>•</span>
              <span>{Math.abs(ambLng).toFixed(4)}°W</span>
            </div>
          </div>

          {/* ETA to Destination */}
          {primaryRoute && primaryRoute.status === 'AVAILABLE' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#596B69]">Transit ETA:</span>
              <span className="font-extrabold text-sm text-[#174C49]">
                ~{Math.round(primaryRoute.durationSeconds / 60)} min
              </span>
              <span className="text-xs text-[#596B69]">
                ({(primaryRoute.distanceMeters / 1000).toFixed(1)} km)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Hospital Inspection Drawer (Stage 3.2: Inspect without mutating active case) */}
      {inspectedHospital && (
        <div className="absolute top-16 right-3 z-20 w-80 max-w-[calc(100%-24px)] bg-white border border-[#DCE5E3] rounded-2xl shadow-xl p-4 animate-in slide-in-from-right duration-200">
          <div className="flex items-start justify-between border-b border-[#DCE5E3] pb-3 mb-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#176B68]" />
                <h3 className="font-bold text-sm text-[#172B2A]">{inspectedHospital.name}</h3>
              </div>
              <p className="text-[11px] text-[#596B69]">{inspectedHospital.address}</p>
            </div>
            <button
              onClick={() => setInspectedHospital(null)}
              className="p-1 text-[#596B69] hover:bg-[#F6F8F8] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#596B69]">Receiving Status:</span>
              <span className="font-bold text-[#176B68]">{inspectedHospital.receivingStatus}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#596B69]">Receiving Intake Delay:</span>
              <span className="font-semibold text-[#172B2A]">~{Math.round(inspectedHospital.receivingDelaySeconds / 60)} min</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {inspectedHospital.capabilities.map((c) => (
                <span key={c} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF5F2] text-[#176B68]">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#DCE5E3] text-[10px] text-[#596B69]">
            Clicking a facility inspects hospital clinical readiness without mutating active dispatch destination.
          </div>
        </div>
      )}
    </div>
  );
};
