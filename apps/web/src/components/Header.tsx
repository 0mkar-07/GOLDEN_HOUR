import React from 'react';
import { NavLink } from 'react-router-dom';
import { Ambulance, Building2, Shield, Clock } from 'lucide-react';
import { ApiHealthBadge } from './ApiHealthBadge';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Demo Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Clock className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">GoldenHour</span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Demo • Synthetic
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Emergency Hospital Coordination Protocol</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`
            }
          >
            <Ambulance className="w-4 h-4" />
            Ambulance
          </NavLink>

          <NavLink
            to="/hospital"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`
            }
          >
            <Building2 className="w-4 h-4" />
            Hospital
          </NavLink>

          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`
            }
          >
            <Shield className="w-4 h-4" />
            Admin & 3D
          </NavLink>
        </nav>

        {/* System Health Badge */}
        <div className="hidden md:flex items-center">
          <ApiHealthBadge />
        </div>
      </div>
    </header>
  );
};
