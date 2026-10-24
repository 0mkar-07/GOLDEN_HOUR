import React from 'react';
import { Shield, Play, Pause, RotateCcw, Activity, Eye, Compass } from 'lucide-react';

export const AdminPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Admin Command & 3D Simulation
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  Global Overview
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Hospital resource audits, active emergency tracking, and synchronized 3D road network simulation.
              </p>
            </div>
          </div>

          {/* Simulation Control Strip */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm">
              <Play className="w-3.5 h-3.5 fill-current" />
              Play
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition">
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* 3D Scene Viewport Placeholder */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <Compass className="w-8 h-8 animate-spin-slow" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Interactive 3D Simulation Canvas (Phase 10)</h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mt-1">
            Three.js & React Three Fiber canvas displaying the connected road graph, 5 hospitals, animated ambulance route, and dynamic A / B / C standby arcs.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Road Network: Graph Loaded
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Renderer: WebGL + 2D Fallback
          </span>
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            State: Shared Backend Clock
          </span>
        </div>
      </div>

      {/* Audit & System State Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Hospital Fleet Status
          </h3>
          <div className="text-xs text-slate-400 space-y-2">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
              <div className="flex justify-between font-medium text-slate-300">
                <span>5 Seeded Hospitals Configured</span>
                <span className="text-emerald-400 font-semibold">100% Online</span>
              </div>
              <div className="text-slate-500">St. Jude (A), Bayview (B), Northpoint (C), Eastside (D), Valley Children (E)</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            Immutable Audit Trail
          </h3>
          <div className="text-xs text-slate-400 space-y-2">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1 font-mono text-[11px] text-slate-300">
              <div>[SYSTEM_INIT] Repository foundation Phase 1 verified</div>
              <div>[MONOREPO] Contracts, API, Web, Fixtures registered</div>
              <div>[READINESS] Health endpoints live</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
