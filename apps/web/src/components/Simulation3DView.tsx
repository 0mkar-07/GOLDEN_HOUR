import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  AlertTriangle,
  Flame,
  Activity,
  Car,
  Compass,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { subscribeToRealtimeEvent } from '../lib/socket';

// Deterministic coordinate projection: Map (x, y) [0, 500] -> 3D (X, Z) [-10, 10]
function mapToScene(x: number, y: number): [number, number, number] {
  return [(x - 250) * 0.05, 0, (y - 250) * 0.05];
}

interface Simulation3DViewProps {
  onTraceCase?: (caseId: string) => void;
  activeCaseId?: string;
}

export const Simulation3DView: React.FC<Simulation3DViewProps> = ({ activeCaseId }) => {
  const [simState, setSimState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);

  // Check WebGL availability
  const webGLSupported = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }, []);

  // Fetch initial simulation state
  const fetchState = async () => {
    try {
      const data = await apiClient.getSimulationState();
      setSimState(data);
    } catch (err: any) {
      console.warn('Failed to load simulation state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  // Subscribe to real-time simulation updates
  useEffect(() => {
    const unsubSim = subscribeToRealtimeEvent('simulation.updated', (event: any) => {
      setSimState(event.payload || event);
    });
    const unsubTelemetry = subscribeToRealtimeEvent('ambulance.telemetry', (event: any) => {
      setSimState((prev: any) =>
        prev
          ? {
              ...prev,
              ambulancePosition: event.payload || event,
            }
          : prev
      );
    });

    return () => {
      unsubSim();
      unsubTelemetry();
    };
  }, []);

  // Simulation Controls
  const handlePlay = async () => {
    try {
      const res = await apiClient.playSimulation(speedMultiplier);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation started');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handlePause = async () => {
    try {
      const res = await apiClient.pauseSimulation();
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation paused');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleStep = async () => {
    try {
      const res = await apiClient.stepSimulation(5);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Stepped forward +5s');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setSpeedMultiplier(speed);
    try {
      const res = await apiClient.setSimulationSpeed(speed);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast(`Speed set to ${speed}x`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleReset = async () => {
    try {
      const res = await apiClient.resetSimulation();
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation reset to origin');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Scenario Injections
  const handleInjectTraffic = async () => {
    try {
      await apiClient.injectTrafficScenario('edge-1', 3.5);
      fetchState();
      showToast('Traffic congestion (+350%) injected on Westside Expressway');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleInjectSurge = async () => {
    try {
      await apiClient.injectHospitalSurgeScenario('hosp-001');
      fetchState();
      showToast('Hospital intake surge (+15m delay) injected at St. Jude');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleInjectDecomp = async () => {
    if (!activeCaseId) {
      showToast('No active case selected for decompensation scenario');
      return;
    }
    try {
      await apiClient.injectDecompensationScenario(activeCaseId);
      fetchState();
      showToast('Patient acute decompensation (SpO2 82%) injected!');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  if (loading || !simState) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <Compass className="w-8 h-8 animate-spin mx-auto text-purple-400 mb-2" />
        Loading Connected 3D Simulation Engine...
      </div>
    );
  }

  const roadGraph = simState?.roadGraph || { nodes: [], edges: [] };
  const ambulancePosition = simState?.ambulancePosition || {
    x: 120,
    y: 150,
    lat: 40.71,
    lng: -74.02,
    heading: 0,
    speed: 0,
    serverSequence: 1,
  };
  const simulationRun = simState?.simulationRun || {
    running: false,
    speedMultiplier: 1.0,
    simulatedSeconds: 0,
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg space-y-4 p-5">
      {/* Header and Control Strip */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-purple-400" />
              Connected 3D Digital Twin & Live Network Simulation
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                simulationRun?.running
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {simulationRun?.running ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronized with authoritative backend clock. Ambulance moves along real road graph edges with live telemetry.
          </p>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {simulationRun?.running ? (
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition shadow-sm"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Play
            </button>
          )}

          <button
            onClick={handleStep}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
            title="Step forward 5 seconds"
          >
            <FastForward className="w-3.5 h-3.5" />
            +5s Step
          </button>

          {/* Speed Selector */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-semibold">
            {[1.0, 2.0, 5.0].map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-2 py-1 rounded transition ${
                  speedMultiplier === s
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
            title="Reset ambulance to start scene"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          {/* View Mode Toggle */}
          <button
            onClick={() => setIs3DMode(!is3DMode)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 text-xs font-semibold rounded-lg transition"
          >
            {is3DMode ? 'Switch to 2D Plan' : 'Switch to 3D View'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Canvas Viewport (Supports 3D Isometric View & SVG Plan Fallback) */}
      <div className="relative w-full h-[420px] bg-slate-950 rounded-xl border border-slate-850 overflow-hidden flex items-center justify-center">
        {/* Render Crisp 2D/3D Digital Twin SVG Canvas */}
        <svg
          viewBox="0 0 550 420"
          className="w-full h-full object-contain select-none"
          style={{
            transform: is3DMode ? 'perspective(600px) rotateX(25deg) scale(0.92)' : 'none',
            transition: 'transform 0.4s ease-out',
          }}
        >
          <defs>
            <linearGradient id="roadGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <radialGradient id="hospGlowA" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="hospGlowB" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid Background Pattern */}
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" opacity="0.6" />

          {/* Road Network Edges */}
          {roadGraph?.edges?.map((edge: any) => {
            const from = roadGraph.nodes.find((n: any) => n.id === edge.from);
            const to = roadGraph.nodes.find((n: any) => n.id === edge.to);
            if (!from || !to) return null;

            const isTraffic = (simState.trafficOverrides?.[edge.id] || edge.trafficMultiplier) > 1.5;

            return (
              <g key={edge.id}>
                {/* Road Casing */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isTraffic ? '#e11d48' : '#334155'}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Road Surface */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isTraffic ? '#881337' : '#0f172a'}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                {/* Center Stripe */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isTraffic ? '#fb7185' : '#64748b'}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              </g>
            );
          })}

          {/* Active Route Glow Polyline */}
          <line
            x1={ambulancePosition.x}
            y1={ambulancePosition.y}
            x2={350}
            y2={150}
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6 4"
            opacity="0.8"
            filter="url(#glow)"
          />

          {/* Contingency Standby Arc to Backup B */}
          <path
            d={`M ${ambulancePosition.x} ${ambulancePosition.y} Q ${(ambulancePosition.x + 150) / 2} ${(ambulancePosition.y + 220) / 2 - 20} 150 220`}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeDasharray="4 3"
            opacity="0.7"
          />

          {/* Hospital Nodes with 3D-Style Isometric Prisms */}
          {roadGraph?.nodes?.map((node: any) => {
            const isHospA = node.id === 'node-hosp-a';
            const isHospB = node.id === 'node-hosp-b';
            const isHospC = node.id === 'node-hosp-c';
            const isHosp = node.id.startsWith('node-hosp');

            if (!isHosp) {
              return (
                <circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r="3.5"
                  fill="#475569"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
              );
            }

            const color = isHospA ? '#10b981' : isHospB ? '#06b6d4' : isHospC ? '#f59e0b' : '#64748b';
            const label = isHospA ? 'A: St. Jude' : isHospB ? 'B: Bayview' : isHospC ? 'C: Northpoint' : node.label.split(' ')[0];

            return (
              <g key={node.id} className="cursor-pointer">
                {/* Halo */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="18"
                  fill={isHospA ? 'url(#hospGlowA)' : isHospB ? 'url(#hospGlowB)' : 'transparent'}
                />
                {/* 3D Hospital Prism Box */}
                <rect
                  x={node.x - 10}
                  y={node.y - 10}
                  width="20"
                  height="20"
                  rx="4"
                  fill={color}
                  filter="url(#glow)"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                {/* Cross Emblem */}
                <path
                  d={`M ${node.x} ${node.y - 5} L ${node.x} ${node.y + 5} M ${node.x - 5} ${node.y} L ${node.x + 5} ${node.y}`}
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Name Label */}
                <text
                  x={node.x}
                  y={node.y + 20}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                  fontWeight="bold"
                  className="font-mono drop-shadow"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Animated Ambulance Vehicle */}
          <g
            transform={`translate(${ambulancePosition.x}, ${ambulancePosition.y}) rotate(${ambulancePosition.heading || 0})`}
            className="transition-transform duration-300 ease-linear"
          >
            {/* Vehicle Shadow */}
            <ellipse cx="0" cy="2" rx="14" ry="8" fill="#000000" opacity="0.6" />
            {/* Vehicle Body */}
            <rect
              x="-12"
              y="-7"
              width="24"
              height="14"
              rx="3"
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth="1.5"
            />
            {/* Cab Windshield */}
            <rect x="5" y="-5" width="4" height="10" rx="1" fill="#38bdf8" />
            {/* Flashing Lightbar */}
            <circle cx="-2" cy="-4" r="2.5" fill="#ef4444" className="animate-pulse" />
            <circle cx="-2" cy="4" r="2.5" fill="#3b82f6" className="animate-pulse" />
            {/* Heading indicator */}
            <polygon points="12,0 9,-3 9,3" fill="#ef4444" />
          </g>
        </svg>

        {/* Real-time HUD Overlay */}
        <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-2 rounded-xl text-xs space-y-1 font-mono text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-white">AMBULANCE TELEMETRY</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Coord: ({ambulancePosition.x}, {ambulancePosition.y}) • Seq: #{ambulancePosition.serverSequence}
          </div>
          <div className="text-[11px] text-slate-400">
            Speed: {ambulancePosition.speed} km/h • Heading: {ambulancePosition.heading}°
          </div>
          <div className="text-[11px] text-emerald-400 font-bold">
            Sim Clock: {Math.round(simulationRun?.simulatedSeconds ?? 0)}s elapsed
          </div>
        </div>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl text-[10px] space-y-1 text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
            <span>Primary Destination A (Full-Care)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded bg-cyan-500" />
            <span>Stabilization Backup B (Standby)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded bg-rose-500" />
            <span>Congested Roadway Segment</span>
          </div>
        </div>
      </div>

      {/* Scenario Injection Action Strip */}
      <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" />
            Dynamic Scenario Injections (Route through Real Domain Services)
          </h3>
          <span className="text-[11px] text-slate-500">
            Demonstrates real-time contingency routing and invariant preservation
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleInjectTraffic}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-slate-200 text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Inject Highway Congestion (+3.5x)
          </button>

          <button
            onClick={handleInjectSurge}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/40 text-slate-200 text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <Activity className="w-4 h-4 text-rose-400" />
            Inject St. Jude ED Surge (+15m)
          </button>

          <button
            onClick={handleInjectDecomp}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 text-slate-200 text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <Activity className="w-4 h-4 text-purple-400" />
            Inject Patient Decompensation
          </button>
        </div>
      </div>
    </div>
  );
};
