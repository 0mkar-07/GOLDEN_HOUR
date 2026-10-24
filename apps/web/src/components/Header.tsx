import React from 'react';
import { NavLink } from 'react-router-dom';
import { Ambulance, Building2, Shield, Clock, User, LogOut } from 'lucide-react';
import { ApiHealthBadge } from './ApiHealthBadge';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@goldenhour/contracts';

export const Header: React.FC = () => {
  const { user, switchUser, logout, loading } = useAuth();

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

        {/* Right Action Bar: Quick Demo Role Switcher & Health Badge */}
        <div className="hidden lg:flex items-center gap-3">
          <ApiHealthBadge />

          {/* Demo User Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="Active Demo Role"
              value={
                user?.role === UserRole.AMBULANCE
                  ? 'paramedic'
                  : user?.hospitalId === 'hosp-001'
                  ? 'stjude'
                  : user?.hospitalId === 'hosp-002'
                  ? 'bayview'
                  : user?.role === UserRole.ADMIN
                  ? 'admin'
                  : 'paramedic'
              }
              onChange={(e) => switchUser(e.target.value as any)}
              disabled={loading}
              className="bg-transparent text-slate-200 font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="paramedic" className="bg-slate-900 text-slate-100">
                Paramedic Lead (Ambulance)
              </option>
              <option value="stjude" className="bg-slate-900 text-slate-100">
                St. Jude ED (Hospital A)
              </option>
              <option value="bayview" className="bg-slate-900 text-slate-100">
                Bayview Urgent (Hospital B)
              </option>
              <option value="admin" className="bg-slate-900 text-slate-100">
                System Dispatcher (Admin)
              </option>
            </select>

            {user && (
              <button
                onClick={logout}
                title="Logout"
                className="text-slate-500 hover:text-rose-400 transition-colors ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
