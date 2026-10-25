import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRole } from '@goldenhour/contracts';
import { useAuth } from '../context/AuthContext';
import { LEGACY_HOSPITALS, DemoPathway, rankLegacyDemo, demoRoute, pointOnDemoRoute } from '../lib/legacy-demo';

export function LegacyDemoPage() {
  const { user, loading } = useAuth();
  const [pathway, setPathway] = useState<DemoPathway>('SPECIALIST');
  const [traffic, setTraffic] = useState(1);
  const [theatreDelay, setTheatreDelay] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ranked = rankLegacyDemo(pathway, traffic, theatreDelay);
  const winner = ranked[0];
  // One real second represents one simulated minute; route remains on the drawn roads.
  useEffect(() => {
    if (!running || user?.role !== UserRole.ADMIN) return;
    const timer = window.setInterval(() => setElapsed((value) => Math.min(winner.travel, value + 0.1)), 100);
    return () => window.clearInterval(timer);
  }, [running, winner.travel, user?.role]);
  useEffect(() => { if (elapsed >= winner.travel) setRunning(false); }, [elapsed, winner.travel]);
  const restart = () => { setRunning(false); setElapsed(0); };
  if (loading) return <p role="status">Loading administrator session...</p>;
  if (user?.role !== UserRole.ADMIN) return <p role="alert">Sign in with the admin demo account to open the New York 2D demo.</p>;
  const route = demoRoute(winner);
  const ambulance = pointOnDemoRoute(route, elapsed / winner.travel);
  return <section className="space-y-5">
    <header>
      <Link to="/admin" className="text-sm underline">Back to NITK admin dispatch</Link>
      <h1 className="text-2xl font-bold mt-2">New York 2D teaching demo</h1>
      <p className="text-sm mt-2">Original fictional hospitals on a schematic city road map. All coordinates, travel times and availability here are simulated. This screen does not modify NITK hospitals, patient cases or dispatch.</p>
      <p className="text-sm mt-1">Local rules demonstration, not a live agent run. A/B/C identify these demo facilities; priority is calculated below.</p>
    </header>
    <div className="flex flex-wrap gap-4 p-4 bg-white border rounded-xl">
      <label>Patient pathway<select aria-label="Demo patient pathway" value={pathway} onChange={(e) => { restart(); setPathway(e.target.value as DemoPathway); }} className="block border p-2 rounded">
        <option value="SPECIALIST">Stable or critical: specialist care required</option>
        <option value="GENERAL">Urgent: general emergency surgery</option>
        <option value="STABILIZATION">Deteriorating: stabilization first</option>
      </select></label>
      <label>Simulated traffic<select aria-label="Demo traffic" value={traffic} onChange={(e) => { restart(); setTraffic(Number(e.target.value)); }} className="block border p-2 rounded">
        <option value={1}>Normal</option><option value={1.5}>Busy (1.5×)</option><option value={2}>Heavy (2×)</option>
      </select></label>
      <label>Bayview theatre ready in<select aria-label="Bayview theatre readiness" value={theatreDelay} onChange={(e) => { restart(); setTheatreDelay(Number(e.target.value)); }} className="block border p-2 rounded">
        <option value={0}>Ready now</option><option value={34}>34 simulated minutes</option>
      </select></label>
    </div>
    <div className="bg-white border rounded-xl p-3">
      <div className="flex gap-3 items-center flex-wrap">
        <button className="bg-[#174C49] text-white rounded px-4 py-2" disabled={elapsed >= winner.travel} onClick={() => setRunning(!running)}>{running ? 'Pause demo' : 'Start demo'}</button>
        <button className="border rounded px-4 py-2" onClick={restart}>Reset journey</button>
        <span role="status">{elapsed >= winner.travel ? 'Arrived' : running ? 'Ambulance moving' : 'Ready / paused'} · {elapsed.toFixed(1)} simulated minutes</span>
        <span className="text-xs">1 second = 1 simulated minute</span>
      </div>
      <svg viewBox="0 0 800 480" className="w-full max-h-[520px]" role="img" aria-label="New York synthetic road map with ambulance and three demo hospitals">
        <rect width="800" height="480" fill="#edf2ef" />
        {[100, 330, 490, 650].map((x) => <path key={x} d={`M${x} 50 V440`} stroke="#c2ceca" strokeWidth="18" />)}
        {[140, 230, 330, 400].map((y) => <path key={y} d={`M50 ${y} H750`} stroke="#c2ceca" strokeWidth="18" />)}
        <text x="25" y="30" fill="#596B69">NEW YORK · SCHEMATIC / NOT TO SCALE</text>
        <polyline points={route.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#176b68" strokeWidth="7" />
        {LEGACY_HOSPITALS.map((hospital) => <g key={hospital.id} transform={`translate(${hospital.x},${hospital.y})`}>
          <circle r="19" fill={hospital.id === winner.id ? '#176b68' : '#596b69'} />
          <text textAnchor="middle" y="5" fill="white" fontWeight="bold">{hospital.role}</text>
          <text textAnchor="middle" y="-30" fontSize="13">{hospital.role === 'A' ? 'St. Jude' : hospital.role === 'B' ? 'Bayview' : 'Northpoint'}</text>
        </g>)}
        <g transform={`translate(${ambulance.x},${ambulance.y})`} data-testid="demo-ambulance">
          <rect x="-18" y="-12" width="36" height="24" rx="5" fill="white" stroke="#b42318" strokeWidth="3" />
          <path d="M-7 0 H7 M0 -7 V7" stroke="#b42318" strokeWidth="3" />
        </g>
      </svg>
    </div>
    <h2 className="text-lg font-bold">Recommended: {winner.name}</h2>
    <p>{pathway === 'SPECIALIST' ? 'Only St. Jude has the required specialist service in this fictional dataset.' : 'Choose the eligible facility with the earliest care start, accounting for travel, readiness and intake.'}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm bg-white border">
      <thead><tr>{['Priority', 'Hospital', 'Travel', 'Care starts', 'Eligibility'].map((text) => <th key={text} className="text-left p-3">{text}</th>)}</tr></thead>
      <tbody>{ranked.map((hospital, index) => <tr key={hospital.id} className="border-t">
        <td className="p-3">{hospital.eligible ? index + 1 : 'Excluded'}</td><td>{hospital.role}: {hospital.name}</td><td>{hospital.travel.toFixed(1)} min</td><td>{hospital.eligible ? `${hospital.timeToCare.toFixed(1)} min` : 'N/A'}</td><td>{hospital.eligible ? 'Meets demo requirements' : 'Required specialist unavailable'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
