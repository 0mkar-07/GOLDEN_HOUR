import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Ambulance, Building2, Shield, Clock, User, LogOut, Menu, X, Box } from 'lucide-react';
import { ApiHealthBadge } from './ApiHealthBadge';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@goldenhour/contracts';

export const Header: React.FC = () => {
  const { user, switchUser, logout, loading, accounts = [] } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const getRoleLabel = () => {
    if (user?.role === UserRole.AMBULANCE) return 'Medic 4 (Ambulance)';
    if (user?.role === UserRole.HOSPITAL) return accounts.find((a) => a.id === user.id)?.hospitalName || user.name;
    if (user?.role === UserRole.ADMIN) return 'Regional Dispatch Command';
    return 'Paramedic Lead';
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
      isActive
        ? 'bg-[#174C49] text-white shadow-sm'
        : 'text-[#596B69] hover:text-[#172B2A] hover:bg-[#EAF5F2]'
    }`;

  return (
    <header className="border-b border-[#DCE5E3] bg-white sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand & Context */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#174C49] flex items-center justify-center text-white shadow-sm">
              <Clock className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-[#172B2A]">GoldenHour</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3]">
                  Demo • Synthetic
                </span>
              </div>
              <p className="text-[11px] text-[#596B69] hidden sm:block">
                Regional Emergency Care & Real-Time Hospital Dispatch
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1.5 p-1 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl">
            <NavLink to="/" end className={navLinkClass}>
              <Ambulance className="w-4 h-4" />
              Ambulance
            </NavLink>

            <NavLink to="/hospital" className={navLinkClass}>
              <Building2 className="w-4 h-4" />
              Hospital
            </NavLink>

            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                  isActive && location.pathname === '/admin' && !location.search.includes('tab=simulation')
                    ? 'bg-[#174C49] text-white shadow-sm'
                    : 'text-[#596B69] hover:text-[#172B2A] hover:bg-[#EAF5F2]'
                }`
              }
            >
              <Shield className="w-4 h-4" />
              Admin Dispatch
            </NavLink>

            <NavLink
              to="/admin?tab=simulation"
              className={() =>
                `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                  location.pathname === '/admin' && location.search.includes('tab=simulation')
                    ? 'bg-[#174C49] text-white shadow-sm'
                    : 'text-[#596B69] hover:text-[#172B2A] hover:bg-[#EAF5F2]'
                }`
              }
            >
              <Box className="w-4 h-4" />
              Simulation
            </NavLink>
            {user?.role === UserRole.ADMIN && <NavLink to="/admin/legacy-demo" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>New York 2D demo</NavLink>}
          </nav>

          {/* Right Section: Health & Account Controls */}
          <div className="hidden lg:flex items-center gap-3">
            <ApiHealthBadge />

            {/* Role Switcher */}
            <div className="flex items-center gap-1.5 bg-white border border-[#DCE5E3] rounded-lg px-2.5 py-1.5 text-xs shadow-xs">
              <User className="w-3.5 h-3.5 text-[#176B68]" />
              <select
                aria-label="Active Demo Role"
                value={user?.email || ''}
                onChange={(e) => void switchUser(e.target.value).catch(() => {})}
                disabled={loading}
                title="Demo accounts use password demo123"
                className="max-w-[240px] bg-transparent text-[#172B2A] font-medium text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="" disabled>Select demo account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.email}>
                    {account.hospitalName || account.name}
                  </option>
                ))}
              </select>

              {user && (
                <button
                  onClick={logout}
                  title="Logout"
                  className="text-[#596B69] hover:text-[#B42318] transition-colors ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-[#DCE5E3] text-[#172B2A] hover:bg-[#F6F8F8]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#DCE5E3] py-3 space-y-2">
            <nav className="flex flex-col gap-1">
              <NavLink
                to="/"
                end
                onClick={() => setMobileMenuOpen(false)}
                className={navLinkClass}
              >
                <Ambulance className="w-4 h-4" />
                Ambulance
              </NavLink>

              <NavLink
                to="/hospital"
                onClick={() => setMobileMenuOpen(false)}
                className={navLinkClass}
              >
                <Building2 className="w-4 h-4" />
                Hospital
              </NavLink>

              <NavLink
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={navLinkClass}
              >
                <Shield className="w-4 h-4" />
                Admin Dispatch
              </NavLink>

              <NavLink
                to="/admin?tab=simulation"
                onClick={() => setMobileMenuOpen(false)}
                className={navLinkClass}
              >
                <Box className="w-4 h-4" />
                Simulation
              </NavLink>
              {user?.role === UserRole.ADMIN && <NavLink to="/admin/legacy-demo" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>New York 2D demo</NavLink>}
          </nav>

            <div className="pt-2 border-t border-[#DCE5E3] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#596B69]">Unit / Role:</span>
                <span className="text-xs font-semibold text-[#172B2A]">{getRoleLabel()}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Active Demo Role Mobile"
                  value={user?.email || ''}
                  onChange={(e) => {
                    void switchUser(e.target.value).catch(() => {});
                    setMobileMenuOpen(false);
                  }}
                  disabled={loading}
                  className="w-full bg-[#F6F8F8] border border-[#DCE5E3] text-[#172B2A] font-medium text-xs rounded-lg px-2.5 py-2"
                >
                  <option value="" disabled>Select demo account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.email}>
                    {account.hospitalName || account.name}
                  </option>
                ))}
                </select>
              </div>
              <div className="pt-1">
                <ApiHealthBadge />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
