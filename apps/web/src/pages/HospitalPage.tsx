import React from 'react';
import { Building2, Layers, CheckSquare, Bell, ShieldCheck } from 'lucide-react';

export const HospitalPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Hospital Command Portal
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  St. Jude Trauma (HOSP-A)
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Resource availability updates, incoming emergency requests, and allocation lifecycle control.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition">
              Refresh Inventory
            </button>
            <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition shadow-md shadow-blue-600/20">
              Update Readiness
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resource Pools */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              Live Resource Pools (Phase 3)
            </h2>
            <span className="text-xs text-slate-500">Atomic Invariant</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p className="leading-relaxed">
              Enforces <code className="text-blue-300">Available = Total - OutOfService - External - Reserved - InUse</code>.
            </p>
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-slate-300 font-medium">Ventilators</span>
                <span className="text-emerald-400 font-semibold font-mono">3 / 8 Free</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-slate-300 font-medium">Trauma Bay OR</span>
                <span className="text-emerald-400 font-semibold font-mono">1 / 2 Ready</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-slate-300 font-medium">ICU Beds</span>
                <span className="text-amber-400 font-semibold font-mono">2 / 12 Free</span>
              </div>
            </div>
          </div>
        </div>

        {/* Incoming Requests */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Incoming Requests (Phase 6)
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">1 Pending</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p>Main requests trigger atomic multi-resource reservation upon staff acceptance.</p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Case #GH-2026-01</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 uppercase">Main Role</span>
              </div>
              <p className="text-slate-400">ETA: 9 mins • Requested: 1x Ventilator, 1x Trauma Bay</p>
              <div className="flex gap-2 pt-1">
                <button className="flex-1 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] transition">
                  Accept & Reserve
                </button>
                <button className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition">
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Lifecycle State */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Lifecycle Guard (Phase 8)
            </h2>
            <span className="text-xs text-slate-500">Explicit Release</span>
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            <p>Arrival does not automatically release resources. Handover records start of explicit use; hospital staff action releases.</p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1.5 font-mono text-[11px]">
              <div className="text-slate-300">RESERVED: Committed on acceptance</div>
              <div className="text-slate-300">IN_USE: Marked explicitly on patient handover</div>
              <div className="text-slate-300">RELEASED: Marked ready by sanitation/staff</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
