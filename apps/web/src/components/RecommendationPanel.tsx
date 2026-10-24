import React from 'react';
import {
  RecommendationDto,
  CandidateEvaluationDto,
  DestinationReadiness,
  DestinationDto,
} from '@goldenhour/contracts';
import {
  MapPin,
  Navigation,
  Clock,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Send,
  Radio,
  XCircle,
  ArrowRightLeft,
} from 'lucide-react';

interface RecommendationPanelProps {
  recommendation: RecommendationDto | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectCandidate?: (candidate: CandidateEvaluationDto) => void;
  destination?: DestinationDto | null;
  onDispatch?: () => void;
  dispatching?: boolean;
  onDivert?: (hospitalId: string) => void;
  diverting?: boolean;
}

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  loading,
  onRefresh,
  onSelectCandidate,
  destination,
  onDispatch,
  dispatching = false,
  onDivert,
  diverting = false,
}) => {
  if (!recommendation) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
        <Sparkles className="w-8 h-8 text-blue-400 mx-auto" />
        <h3 className="font-bold text-white text-base">Destination Recommendation Standby</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Confirm patient clinical requirements above to run Agent 2 (Suitability Filtering) and Agent 3 (Time & Coordination Ranking).
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Run Destination Matching
        </button>
      </div>
    );
  }

  const { hospitalA, hospitalB, hospitalC } = recommendation;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500" />
            Destination Coordination (Agent 2 & 3 Matching)
          </h2>
          <p className="text-xs text-slate-400">
            Formula: <code className="text-blue-300">CareStart = max(Arrival, ResourceReady) + ReceivingDelay</code>
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Re-evaluate
        </button>
      </div>

      {/* Destination Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hospital A: Primary Destination */}
        <div className="bg-slate-900 border-2 border-red-500/50 rounded-2xl p-5 space-y-3 shadow-lg shadow-red-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-red-600 text-white font-bold text-[10px] tracking-wider uppercase px-3 py-1 rounded-bl-xl shadow-sm">
            Primary (A)
          </div>

          <div>
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
              Definitive Full-Care Center
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {hospitalA ? hospitalA.name : 'No Eligible Full-Care Facility'}
            </h3>
            <p className="text-xs text-slate-400 font-mono">Code: {hospitalA?.code || 'N/A'}</p>
          </div>

          {hospitalA ? (
            <div className="space-y-3">
              {/* Time Breakdown Card */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Road Transit ETA:</span>
                  <span className="text-slate-200 font-bold">~{Math.round(hospitalA.travelSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Intake / Receiving Delay:</span>
                  <span className="text-slate-200">+{Math.round(hospitalA.receivingDelaySeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 text-sm font-bold">
                  <span className="text-red-400">Estimated Care Start:</span>
                  <span className="text-emerald-400">~{Math.round(hospitalA.timeToCareSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-[11px] text-slate-500 font-sans">
                  <span>Routing Engine:</span>
                  <span className="font-semibold text-slate-400">
                    {hospitalA.routingSource === 'LIVE_OSRM' ? 'Live Routing Engine' : 'Simulated Road Graph'}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              <div className="text-xs text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300">Agent Rationale:</span>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  {hospitalA.reasons.slice(0, 2).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {/* Dispatch Action & Live Destination Readiness */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {destination ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Destination State:</span>
                      {destination.readiness === DestinationReadiness.PENDING && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold animate-pulse">
                          <Radio className="w-3.5 h-3.5 text-amber-400" />
                          Requested (Awaiting Confirmation)
                        </span>
                      )}
                      {destination.readiness === DestinationReadiness.CONFIRMED && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmed • Resources Reserved
                        </span>
                      )}
                      {destination.readiness === DestinationReadiness.UNAVAILABLE && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold">
                          <XCircle className="w-3.5 h-3.5" />
                          Unavailable / Declined
                        </span>
                      )}
                    </div>
                    {destination.readiness === DestinationReadiness.CONFIRMED && (
                      <p className="text-[11px] text-emerald-400/90 leading-tight">
                        Hospital {hospitalA.name} confirmed the reservation. Full-care inventory atomically locked.
                      </p>
                    )}
                    {destination.readiness === DestinationReadiness.PENDING && (
                      <p className="text-[11px] text-amber-300/80 leading-tight">
                        Ambulance dispatched. Waiting for Hospital {hospitalA.name} coordinator to accept reservation.
                      </p>
                    )}
                  </div>
                ) : (
                  onDispatch && (
                    <button
                      onClick={onDispatch}
                      disabled={dispatching || loading}
                      className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {dispatching ? 'Dispatching & Notifying...' : 'Dispatch Ambulance to Hospital A'}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 text-xs text-rose-300">
              No hospital in the network currently meets all full-care requirements with available capacity.
            </div>
          )}
        </div>

        {/* Hospital B: Stabilization Backup 1 */}
        <div className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 space-y-3 relative overflow-hidden transition">
          <div className="absolute top-0 right-0 bg-amber-500/20 text-amber-300 border-b border-l border-amber-500/30 font-bold text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-bl-xl">
            Backup (B)
          </div>

          <div>
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Immediate Stabilization
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {hospitalB ? hospitalB.name : 'No Backup Available'}
            </h3>
            <p className="text-xs text-slate-400 font-mono">Code: {hospitalB?.code || 'N/A'}</p>
          </div>

          {hospitalB && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Current-Position ETA:</span>
                  <span className="text-emerald-400 font-bold">~{Math.round(hospitalB.travelSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 text-xs font-bold">
                  <span className="text-slate-300">Time to Care:</span>
                  <span className="text-slate-200">~{Math.round(hospitalB.timeToCareSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-[10px] text-slate-500 font-sans">
                  <span>Routing:</span>
                  <span className="font-semibold text-slate-400">
                    {hospitalB.routingSource === 'LIVE_OSRM' ? 'Live Routing Engine' : 'Simulated Road Graph'}
                  </span>
                </div>
              </div>

              {/* Capabilities & Limitations */}
              <div className="text-xs space-y-1">
                <span className="font-semibold text-slate-300">Limitations vs Hospital A:</span>
                {hospitalB.missingCapabilities.length > 0 ? (
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    Lacks definitive: {hospitalB.missingCapabilities.join(', ')}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Meets immediate stabilization criteria.</p>
                )}
              </div>

              <div className="text-[11px] text-slate-500 italic">
                Standby notice only; does not lock equipment.
              </div>

              {/* Clinician Diversion Action */}
              {onDivert && destination && destination.hospitalId !== hospitalB.hospitalId && (
                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => onDivert(hospitalB.hospitalId)}
                    disabled={diverting || loading}
                    className="w-full py-1.5 px-3 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {diverting ? 'Diverting Route...' : 'Divert to Backup B'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hospital C: Stabilization Backup 2 */}
        <div className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 space-y-3 relative overflow-hidden transition">
          <div className="absolute top-0 right-0 bg-amber-500/20 text-amber-300 border-b border-l border-amber-500/30 font-bold text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-bl-xl">
            Backup (C)
          </div>

          <div>
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Secondary Stabilization
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {hospitalC ? hospitalC.name : 'No Backup Available'}
            </h3>
            <p className="text-xs text-slate-400 font-mono">Code: {hospitalC?.code || 'N/A'}</p>
          </div>

          {hospitalC && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Current-Position ETA:</span>
                  <span className="text-emerald-400 font-bold">~{Math.round(hospitalC.travelSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 text-xs font-bold">
                  <span className="text-slate-300">Time to Care:</span>
                  <span className="text-slate-200">~{Math.round(hospitalC.timeToCareSeconds / 60)} mins</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-[10px] text-slate-500 font-sans">
                  <span>Routing:</span>
                  <span className="font-semibold text-slate-400">
                    {hospitalC.routingSource === 'LIVE_OSRM' ? 'Live Routing Engine' : 'Simulated Road Graph'}
                  </span>
                </div>
              </div>

              {/* Capabilities & Limitations */}
              <div className="text-xs space-y-1">
                <span className="font-semibold text-slate-300">Limitations vs Hospital A:</span>
                {hospitalC.missingCapabilities.length > 0 ? (
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    Lacks definitive: {hospitalC.missingCapabilities.join(', ')}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Meets immediate stabilization criteria.</p>
                )}
              </div>

              <div className="text-[11px] text-slate-500 italic">
                Dynamic candidate evaluated from current coordinates.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Clinical Coordinator Briefing (Agent LLM Narrative) */}
      {recommendation.coordinatorBriefing && (
        <div className="bg-gradient-to-r from-blue-950/40 via-purple-950/25 to-slate-900 border border-purple-500/30 rounded-2xl p-5 space-y-2.5 shadow-lg shadow-purple-950/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              AI Dispatch Coordinator Briefing (Gemini Agent)
            </h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold">
              Live Synthesis
            </span>
          </div>
          <p className="text-xs text-purple-200/90 leading-relaxed">
            {recommendation.coordinatorBriefing}
          </p>
        </div>
      )}

      {/* Tri-Agent Explanation Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
          Tri-Agent Decision Pipeline Breakdown
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
            <span className="font-bold text-blue-400">Agent 1 — Requirements</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Synthesizes patient vitals & telemetry into confirmed full-care and immediate stabilization criteria.
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
            <span className="font-bold text-amber-400">Agent 2 — Suitability</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Filters 5 hospitals by capabilities, equipment availability (Available &gt; 0), and specialist team readiness.
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
            <span className="font-bold text-emerald-400">Agent 3 — Coordination & Time</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Calculates shortest road path & time-to-care to select Primary Destination A and current-position Backups B &amp; C.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
