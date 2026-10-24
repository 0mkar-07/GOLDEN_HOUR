import React from 'react';
import { Ambulance, AlertCircle, MapPin, Sparkles, Navigation } from 'lucide-react';

export const AmbulancePage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              <Ambulance className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Ambulance Mobile Terminal
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Unit 104 • Active
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                In-transit patient requirements confirmation and dynamic A / B / C destination triage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition">
              Simulate Telemetry
            </button>
            <button className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition shadow-md shadow-red-600/20">
              New Case Entry
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Sections Planned for Phase 4 & 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case & Telemetry Section */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Patient Assessment (Agent 1)
            </h2>
            <span className="text-xs text-slate-500">Awaiting Confirmation</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p>Phase 1 Foundation Ready. Case entry, clinical telemetry input, and Agent 1 requirement synthesis will be active in Phase 4.</p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 font-mono text-[11px] text-slate-300">
              <div>Telemetry Feed: Synthetic stream standby</div>
              <div>Urgency: Critical (Polytrauma)</div>
              <div>Clinician Confirmation: Pending</div>
            </div>
          </div>
        </div>

        {/* Primary Destination A */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-400" />
              Primary Destination (Hospital A)
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">Full-Care</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p>Targeted hospital satisfying full-care requirements, evaluated by estimated time to care start.</p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
              <div className="font-semibold text-slate-200">St. Jude Metropolitan Trauma Center</div>
              <div className="text-slate-400">ETA to Care: ~14 mins (Arrival: 9m, Readiness: Confirmed)</div>
            </div>
          </div>
        </div>

        {/* Dynamic Backups B & C */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-amber-400" />
              Stabilization Backups (B & C)
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">Position-Aware</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p>Calculated dynamically from the ambulance's real-time position for rapid stabilization.</p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1.5">
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium">Option B: Bayview Urgent</span>
                <span className="text-emerald-400 font-mono text-[11px]">~5 mins</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium">Option C: Northpoint Regional</span>
                <span className="text-emerald-400 font-mono text-[11px]">~8 mins</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
