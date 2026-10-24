import React from 'react';
import {
  RecommendationDto,
  CandidateEvaluationDto,
  DestinationReadiness,
  DestinationDto,
  EmergencyPriorityTicketDto,
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
  onDispatch?: (targetHospitalId?: string, careObjective?: 'FULL_CARE' | 'STABILIZATION') => void;
  dispatching?: boolean;
  onDivert?: (hospitalId: string) => void;
  diverting?: boolean;
  priorityTicket?: EmergencyPriorityTicketDto | null;
  onRequestPriorityReview?: (hospitalId: string) => void;
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
  priorityTicket = null,
  onRequestPriorityReview,
}) => {
  if (!recommendation) {
    return (
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-6 text-center space-y-3 shadow-xs">
        <Sparkles className="w-8 h-8 text-[#176B68] mx-auto" />
        <h3 className="font-bold text-[#172B2A] text-base">Destination Recommendation Standby</h3>
        <p className="text-xs text-[#596B69] max-w-md mx-auto">
          Confirm patient clinical requirements above to run Agent 2 (Suitability Filtering) and Agent 3 (Time & Coordination Ranking).
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 bg-[#174C49] hover:bg-[#135552] text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-2"
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
          <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
            <Navigation className="w-5 h-5 text-[#176B68]" />
            Tri-Agent Destination Recommendations
          </h2>
          <p className="text-xs text-[#596B69] mt-0.5">
            Agent 2 (Verified Capabilities & Surgical Teams) + Agent 3 (Time-to-Care Dynamic Ranking)
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#172B2A] text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recalculate
        </button>
      </div>

      {/* AI Dispatch Coordinator Live Briefing Banner */}
      {recommendation.coordinatorBriefing && (
        <div className="p-3.5 bg-[#EAF5F2] border border-[#DCE5E3] rounded-xl flex items-start gap-3">
          <div className="p-1.5 bg-white rounded-lg border border-[#DCE5E3] text-[#176B68] shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#174C49]">
              AI Dispatch Coordinator Briefing (Gemini Agent)
            </span>
            <p className="text-xs text-[#172B2A] leading-relaxed">
              {recommendation.coordinatorBriefing}
            </p>
          </div>
        </div>
      )}

      {/* Emergency-Priority Review Banner (Stages 3 & 4) */}
      {priorityTicket && (
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
            priorityTicket.status === 'PENDING_REVIEW'
              ? 'bg-[#FFF8E6] border-[#FEEFC7] text-[#8A5800]'
              : priorityTicket.status === 'APPROVED'
              ? 'bg-[#EAF5F2] border-[#DCE5E3] text-[#176B68]'
              : 'bg-red-50 border-red-200 text-[#B42318]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {priorityTicket.status === 'PENDING_REVIEW' ? (
              <Clock className="w-4 h-4 shrink-0 text-[#B54708] animate-spin mt-0.5" />
            ) : priorityTicket.status === 'APPROVED' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#176B68] mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-[#B42318] mt-0.5" />
            )}
            <div>
              <span className="font-bold block">
                {priorityTicket.status === 'PENDING_REVIEW'
                  ? 'Availability pending hospital review'
                  : priorityTicket.status === 'APPROVED'
                  ? 'Emergency Priority Confirmed'
                  : 'Elective Deferral Declined'}
              </span>
              <span className="text-[11px] opacity-90">
                {priorityTicket.status === 'PENDING_REVIEW'
                  ? `Review ticket submitted to defer conflicting elective case (${priorityTicket.conflictingProcedureName}). Waiting for hospital surgical director.`
                  : priorityTicket.status === 'APPROVED'
                  ? `Hospital surgical director approved deferral. Operating theatre reserved for inbound emergency.`
                  : `Hospital was unable to defer scheduled procedure: ${priorityTicket.reviewerNotes || 'Capacity locked'}`}
              </span>
            </div>
          </div>

          <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white border border-current shadow-xs">
            {priorityTicket.status}
          </span>
        </div>
      )}

      {/* Trigger button for Emergency-Priority Deferral if no ticket pending */}
      {!priorityTicket && onRequestPriorityReview && (hospitalA || recommendation.priorityCandidates?.[0]) && (
        <div className="p-3 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#596B69]">
            <Clock className="w-4 h-4 text-[#176B68]" />
            <span>Schedule Conflict? Request hospital review to defer unstarted elective cases for incoming trauma.</span>
          </div>
          <button
            onClick={() =>
              onRequestPriorityReview(
                hospitalA?.hospitalId || recommendation.priorityCandidates?.[0]?.hospitalId || 'hosp-001'
              )
            }
            className="px-3 py-1.5 bg-[#174C49] hover:bg-[#093D39] text-white font-semibold rounded-lg shadow-xs transition text-xs shrink-0"
          >
            Request Emergency Priority Review
          </button>
        </div>
      )}

      {/* Stabilization Priority Banner when Hospital A is not available */}
      {(!hospitalA || recommendation.recommendationMode === 'STABILIZATION_ONLY') && (
        <div className="p-3.5 bg-[#FFF8E6] border border-[#F3E5AB] rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-[#8A5800]">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#8A5800]" />
            <span className="font-semibold text-xs text-[#8A5800]">
              No full-care destination is currently eligible. Stabilization options are available below.
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#8A5800] bg-white/80 px-2.5 py-0.5 rounded-full border border-[#F3E5AB] shrink-0">
            Stabilization Priority
          </span>
        </div>
      )}

      {/* Recommendations Grid: If in STABILIZATION_ONLY mode, remove empty A card completely! */}
      {!hospitalA || recommendation.recommendationMode === 'STABILIZATION_ONLY' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority 1 Stabilization Candidate (e.g. Bayview B) */}
          {hospitalB && (
            <div className="bg-white border-2 border-[#176B68] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
              <div className="bg-[#EAF5F2] px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#174C49] text-white text-[10px] font-bold uppercase tracking-wider">
                    Priority 1 — Stabilization
                  </span>
                  <span className="text-xs font-bold text-[#172B2A]">Immediate Stabilization</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-white border border-[#DCE5E3] text-[#176B68]">
                  {hospitalB.code}
                </span>
              </div>

              <div className="p-4 space-y-3 flex-1">
                <div>
                  <h3 className="font-bold text-sm text-[#172B2A]">{hospitalB.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#596B69] mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#176B68]" />
                    <span>First eligible emergency stabilization destination</span>
                  </div>
                </div>

                {/* Time Breakdown Card */}
                <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[#596B69]">
                    <span>Current Road Drive ETA:</span>
                    <span className="text-[#237048] font-bold">~{Math.round(hospitalB.travelSeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center text-[#596B69]">
                    <span>Intake / Receiving Delay:</span>
                    <span className="text-[#172B2A]">+{Math.round(hospitalB.receivingDelaySeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-[#DCE5E3] text-xs font-bold">
                    <span className="text-[#174C49]">Estimated Care Start:</span>
                    <span className="text-[#172B2A]">~{Math.round(hospitalB.timeToCareSeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-[10px] text-[#596B69]">
                    <span>Routing Engine:</span>
                    <span className="font-semibold text-[#172B2A]">
                      {hospitalB.routingSource === 'GOOGLE_ROUTES'
                        ? 'Google Routes API'
                        : hospitalB.routingSource === 'LIVE_OSRM'
                        ? 'Live OSRM'
                        : 'Simulated Road Graph'}
                    </span>
                  </div>
                </div>

                {/* Unmet Full-Care Limitations */}
                <div className="text-xs space-y-1">
                  <span className="font-semibold text-[#172B2A]">Full-care requirements not available here:</span>
                  <p className="text-[11px] text-[#8A5800] bg-[#FFF8E6] p-2.5 rounded-lg border border-[#F3E5AB]">
                    {hospitalB.missingCapabilities.length > 0
                      ? `Lacks full-care specialties: ${hospitalB.missingCapabilities.join(', ')}. Suitable for emergency airway/hemodynamic stabilization only.`
                      : 'Equipped for emergency stabilization triage.'}
                  </p>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-[#F6F8F8] border-t border-[#DCE5E3]">
                {destination && destination.hospitalId === hospitalB.hospitalId ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#596B69]">Destination State:</span>
                      {destination.readiness === DestinationReadiness.PENDING && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB] text-xs font-bold animate-pulse">
                          <Radio className="w-3.5 h-3.5 text-[#8A5800]" />
                          Requested (Awaiting Acceptance)
                        </span>
                      )}
                      {destination.readiness === DestinationReadiness.CONFIRMED && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3] text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#237048]" />
                          Confirmed • Resources Reserved
                        </span>
                      )}
                    </div>
                  </div>
                ) : destination ? (
                  <button
                    onClick={() => onDivert && onDivert(hospitalB.hospitalId)}
                    disabled={diverting}
                    className="w-full py-2.5 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#176B68] font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {diverting ? 'Diverting...' : `Divert to ${hospitalB.name} (${hospitalB.code})`}
                  </button>
                ) : (
                  <button
                    onClick={() => onDispatch?.(hospitalB.hospitalId, 'STABILIZATION')}
                    disabled={dispatching}
                    className="w-full py-2.5 bg-[#174C49] hover:bg-[#135552] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {dispatching ? 'Dispatching & Notifying...' : `Dispatch to ${hospitalB.name} for stabilization`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Priority 2 Stabilization Candidate (e.g. C) */}
          {hospitalC && (
            <div className="bg-white border border-[#DCE5E3] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
              <div className="bg-white px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3] text-[10px] font-bold uppercase tracking-wider">
                    Priority 2 — Stabilization
                  </span>
                  <span className="text-xs font-bold text-[#172B2A]">Secondary Contingency</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-[#F6F8F8] border border-[#DCE5E3] text-[#596B69]">
                  {hospitalC.code}
                </span>
              </div>

              <div className="p-4 space-y-3 flex-1">
                <div>
                  <h3 className="font-bold text-sm text-[#172B2A]">{hospitalC.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#596B69] mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#176B68]" />
                    <span>Secondary proximity contingency</span>
                  </div>
                </div>

                {/* Time Breakdown Card */}
                <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[#596B69]">
                    <span>Current Road Drive ETA:</span>
                    <span className="text-[#237048] font-bold">~{Math.round(hospitalC.travelSeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center text-[#596B69]">
                    <span>Intake / Receiving Delay:</span>
                    <span className="text-[#172B2A]">+{Math.round(hospitalC.receivingDelaySeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-[#DCE5E3] text-xs font-bold">
                    <span className="text-[#596B69]">Time to Care:</span>
                    <span className="text-[#172B2A]">~{Math.round(hospitalC.timeToCareSeconds / 60)} mins</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-[10px] text-[#596B69]">
                    <span>Routing:</span>
                    <span className="font-semibold text-[#172B2A]">
                      {hospitalC.routingSource === 'GOOGLE_ROUTES'
                        ? 'Google Routes API'
                        : hospitalC.routingSource === 'LIVE_OSRM'
                        ? 'Live OSRM'
                        : 'Simulated Road Graph'}
                    </span>
                  </div>
                </div>

                {/* Unmet Full-Care Limitations */}
                <div className="text-xs space-y-1">
                  <span className="font-semibold text-[#172B2A]">Full-care requirements not available here:</span>
                  <p className="text-[11px] text-[#8A5800] bg-[#FFF8E6] p-2.5 rounded-lg border border-[#F3E5AB]">
                    {hospitalC.missingCapabilities.length > 0
                      ? `Lacks full-care specialties: ${hospitalC.missingCapabilities.join(', ')}.`
                      : 'Alternative stabilization center.'}
                  </p>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-[#F6F8F8] border-t border-[#DCE5E3]">
                {destination && destination.hospitalId === hospitalC.hospitalId ? (
                  <div className="p-2 rounded-xl bg-[#EAF5F2] border border-[#DCE5E3] text-center text-xs font-bold text-[#174C49]">
                    Currently Diverted to Backup C
                  </div>
                ) : destination ? (
                  <button
                    onClick={() => onDivert && onDivert(hospitalC.hospitalId)}
                    disabled={diverting}
                    className="w-full py-2.5 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#596B69] hover:text-[#172B2A] font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {diverting ? 'Diverting...' : `Divert to ${hospitalC.name} (${hospitalC.code})`}
                  </button>
                ) : (
                  <button
                    onClick={() => onDispatch?.(hospitalC.hospitalId, 'STABILIZATION')}
                    disabled={dispatching}
                    className="w-full py-2.5 bg-white border border-[#176B68] hover:bg-[#EAF5F2] text-[#176B68] font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {dispatching ? 'Dispatching & Notifying...' : `Choose this alternative for stabilization`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Standard 3-Column Recommendations Grid when Full-Care Hospital A is available */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Destination A: Primary Full-Care Hospital */}
          <div className="bg-white border-2 border-[#176B68] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="bg-[#EAF5F2] px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#174C49] text-white text-[10px] font-bold uppercase tracking-wider">
                  Primary (A)
                </span>
                <span className="text-xs font-bold text-[#172B2A]">Full Definitive Care</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-white border border-[#DCE5E3] text-[#176B68]">
                {hospitalA?.code || 'N/A'}
              </span>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {hospitalA && (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#172B2A]">{hospitalA.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#596B69] mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-[#176B68]" />
                      <span>Eligible for all confirmed full-care requirements</span>
                    </div>
                  </div>

                  {/* Time Breakdown Card */}
                  <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[#596B69]">
                      <span>Road Transit ETA:</span>
                      <span className="text-[#172B2A] font-bold">~{Math.round(hospitalA.travelSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center text-[#596B69]">
                      <span>Intake / Receiving Delay:</span>
                      <span className="text-[#172B2A]">+{Math.round(hospitalA.receivingDelaySeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-[#DCE5E3] text-sm font-bold">
                      <span className="text-[#174C49]">Estimated Care Start:</span>
                      <span className="text-[#237048]">~{Math.round(hospitalA.timeToCareSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 text-[11px] text-[#596B69]">
                      <span>Routing Engine:</span>
                      <span className="font-semibold text-[#172B2A]">
                        {hospitalA.routingSource === 'GOOGLE_ROUTES'
                          ? 'Google Routes API'
                          : hospitalA.routingSource === 'LIVE_OSRM'
                          ? 'Live OSRM Router'
                          : 'Simulated Road Graph'}
                      </span>
                    </div>
                  </div>

                  {/* Rationale */}
                  <div className="text-xs text-[#596B69] space-y-1">
                    <span className="font-semibold text-[#172B2A]">Agent Rationale:</span>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      {hospitalA.reasons.slice(0, 2).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-[#F6F8F8] border-t border-[#DCE5E3]">
              {destination && destination.hospitalId === hospitalA?.hospitalId ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#596B69]">Destination State:</span>
                    {destination.readiness === DestinationReadiness.PENDING && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF8E6] text-[#8A5800] border border-[#F3E5AB] text-xs font-bold animate-pulse">
                        <Radio className="w-3.5 h-3.5 text-[#8A5800]" />
                        Requested (Awaiting Confirmation)
                      </span>
                    )}
                    {destination.readiness === DestinationReadiness.CONFIRMED && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3] text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#237048]" />
                        Confirmed • Resources Reserved
                      </span>
                    )}
                    {destination.readiness === DestinationReadiness.UNAVAILABLE && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FDF2F2] text-[#B42318] border border-[#F8D7DA] text-xs font-bold">
                        <XCircle className="w-3.5 h-3.5 text-[#B42318]" />
                        Unavailable / Declined
                      </span>
                    )}
                  </div>

                  {destination.readiness === DestinationReadiness.CONFIRMED && (
                    <p className="text-[11px] text-[#237048] leading-tight">
                      Hospital {hospitalA.name} confirmed the reservation. Full-care inventory atomically locked.
                    </p>
                  )}

                  {destination.readiness === DestinationReadiness.PENDING && (
                    <p className="text-[11px] text-[#8A5800] leading-tight">
                      Ambulance dispatched. Waiting for Hospital {hospitalA.name} coordinator to accept reservation.
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => hospitalA && onDispatch?.(hospitalA.hospitalId, 'FULL_CARE')}
                  disabled={!hospitalA || dispatching}
                  className="w-full py-2.5 bg-[#174C49] hover:bg-[#135552] disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {dispatching ? 'Dispatching & Notifying...' : 'Dispatch Ambulance to Hospital A'}
                </button>
              )}
            </div>
          </div>

          {/* Destination B: Dynamic Stabilization Backup */}
          <div className="bg-white border border-[#DCE5E3] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="bg-white px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3] text-[10px] font-bold uppercase tracking-wider">
                  Backup (B)
                </span>
                <span className="text-xs font-bold text-[#172B2A]">Immediate Stabilization</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-[#F6F8F8] border border-[#DCE5E3] text-[#596B69]">
                {hospitalB?.code || 'N/A'}
              </span>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {hospitalB ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#172B2A]">{hospitalB.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#596B69] mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-[#176B68]" />
                      <span>Ranked by proximity from current ambulance coordinate</span>
                    </div>
                  </div>

                  {/* Time Breakdown Card */}
                  <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[#596B69]">
                      <span>Current-Position ETA:</span>
                      <span className="text-[#237048] font-bold">~{Math.round(hospitalB.travelSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-[#DCE5E3] text-xs font-bold">
                      <span className="text-[#596B69]">Time to Care:</span>
                      <span className="text-[#172B2A]">~{Math.round(hospitalB.timeToCareSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 text-[10px] text-[#596B69]">
                      <span>Routing:</span>
                      <span className="font-semibold text-[#172B2A]">
                        {hospitalB.routingSource === 'GOOGLE_ROUTES'
                          ? 'Google Routes API'
                          : hospitalB.routingSource === 'LIVE_OSRM'
                          ? 'Live OSRM'
                          : 'Simulated Road Graph'}
                      </span>
                    </div>
                  </div>

                  {/* Limitations */}
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-[#172B2A]">Full-care requirements not available here:</span>
                    <p className="text-[11px] text-[#8A5800] bg-[#FFF8E6] p-2 rounded-lg border border-[#F3E5AB]">
                      {hospitalB.missingCapabilities.length > 0
                        ? `Lacks full-care specialties: ${hospitalB.missingCapabilities.join(', ')}. Suitable for emergency airway/hemodynamic stabilization only.`
                        : 'Equipped for stabilization triage.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl text-center text-xs text-[#596B69]">
                  No distinct stabilization backup within immediate radius.
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-[#F6F8F8] border-t border-[#DCE5E3]">
              {destination && destination.hospitalId === hospitalB?.hospitalId ? (
                <div className="p-2 rounded-xl bg-[#EAF5F2] border border-[#DCE5E3] text-center text-xs font-bold text-[#174C49]">
                  Currently Diverted to Backup B
                </div>
              ) : destination ? (
                <button
                  onClick={() => hospitalB && onDivert && onDivert(hospitalB.hospitalId)}
                  disabled={!hospitalB || diverting}
                  className="w-full py-2 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#176B68] font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  {diverting ? 'Diverting...' : `Divert to Backup B (${hospitalB?.code || 'Backup B'})`}
                </button>
              ) : (
                <div className="text-center text-[11px] text-[#596B69]">
                  Standby ticket issued automatically on dispatch
                </div>
              )}
            </div>
          </div>

          {/* Destination C: Secondary Proximity Backup */}
          <div className="bg-white border border-[#DCE5E3] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="bg-white px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#F6F8F8] text-[#596B69] border border-[#DCE5E3] text-[10px] font-bold uppercase tracking-wider">
                  Backup (C)
                </span>
                <span className="text-xs font-bold text-[#172B2A]">Secondary Contingency</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-[#F6F8F8] border border-[#DCE5E3] text-[#596B69]">
                {hospitalC?.code || 'N/A'}
              </span>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {hospitalC ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#172B2A]">{hospitalC.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#596B69] mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-[#176B68]" />
                      <span>Secondary proximity contingency</span>
                    </div>
                  </div>

                  {/* Time Breakdown Card */}
                  <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[#596B69]">
                      <span>Current-Position ETA:</span>
                      <span className="text-[#237048] font-bold">~{Math.round(hospitalC.travelSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-[#DCE5E3] text-xs font-bold">
                      <span className="text-[#596B69]">Time to Care:</span>
                      <span className="text-[#172B2A]">~{Math.round(hospitalC.timeToCareSeconds / 60)} mins</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 text-[10px] text-[#596B69]">
                      <span>Routing:</span>
                      <span className="font-semibold text-[#172B2A]">
                        {hospitalC.routingSource === 'GOOGLE_ROUTES'
                          ? 'Google Routes API'
                          : hospitalC.routingSource === 'LIVE_OSRM'
                          ? 'Live OSRM'
                          : 'Simulated Road Graph'}
                      </span>
                    </div>
                  </div>

                  {/* Limitations */}
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-[#172B2A]">Full-care requirements not available here:</span>
                    <p className="text-[11px] text-[#8A5800] bg-[#FFF8E6] p-2 rounded-lg border border-[#F3E5AB]">
                      {hospitalC.missingCapabilities.length > 0
                        ? `Lacks full-care specialties: ${hospitalC.missingCapabilities.join(', ')}.`
                        : 'Alternative stabilization center.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl text-center text-xs text-[#596B69]">
                  No tertiary facility identified in current quadrant.
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-[#F6F8F8] border-t border-[#DCE5E3]">
              {destination && destination.hospitalId === hospitalC?.hospitalId ? (
                <div className="p-2 rounded-xl bg-[#EAF5F2] border border-[#DCE5E3] text-center text-xs font-bold text-[#174C49]">
                  Currently Diverted to Backup C
                </div>
              ) : destination ? (
                <button
                  onClick={() => hospitalC && onDivert && onDivert(hospitalC.hospitalId)}
                  disabled={!hospitalC || diverting}
                  className="w-full py-2 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#596B69] hover:text-[#172B2A] font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  {diverting ? 'Diverting...' : `Divert to Backup C (${hospitalC?.code || 'Backup C'})`}
                </button>
              ) : (
                <div className="text-center text-[11px] text-[#596B69]">
                  Standby ticket issued automatically on dispatch
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tri-Agent Decision Pipeline Breakdown */}
      <div className="bg-white border border-[#DCE5E3] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#172B2A] flex items-center gap-2">
            <Info className="w-4 h-4 text-[#176B68]" />
            Tri-Agent Decision Pipeline Breakdown
          </h3>
          <span className="text-[11px] text-[#596B69] font-medium">
            3-Tier Algorithmic Orchestration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1">
            <span className="font-bold text-[#174C49]">Agent 1 — Requirements</span>
            <p className="text-[#596B69] leading-relaxed text-[11px]">
              Synthesizes patient vitals & telemetry into confirmed full-care and immediate stabilization criteria.
            </p>
          </div>

          <div className="p-3.5 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1">
            <span className="font-bold text-[#8A5800]">Agent 2 — Suitability</span>
            <p className="text-[#596B69] leading-relaxed text-[11px]">
              Filters regional hospitals by capabilities, equipment availability (Available &gt; 0), and specialist team readiness.
            </p>
          </div>

          <div className="p-3.5 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1">
            <span className="font-bold text-[#237048]">Agent 3 — Coordination & Time</span>
            <p className="text-[#596B69] leading-relaxed text-[11px]">
              Calculates shortest road path & time-to-care to select Primary Destination A and current-position Backups B &amp; C.
            </p>
          </div>
        </div>

        {recommendation.allCandidates && recommendation.allCandidates.length > 0 && (
          <div className="overflow-x-auto pt-2 border-t border-[#DCE5E3]">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#DCE5E3] text-[11px] font-semibold text-[#596B69] bg-[#F6F8F8]">
                  <th className="py-2 px-3">Hospital</th>
                  <th className="py-2 px-3">Definitive Status</th>
                  <th className="py-2 px-3">Transit ETA</th>
                  <th className="py-2 px-3">Time-to-Care</th>
                  <th className="py-2 px-3">Suitability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE5E3]">
                {recommendation.allCandidates.map((cand) => (
                  <tr key={cand.hospitalId} className="hover:bg-[#F6F8F8] transition-colors">
                    <td className="py-2 px-3 font-semibold text-[#172B2A]">
                      {cand.name} ({cand.code})
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          cand.eligible
                            ? 'bg-[#EAF5F2] text-[#176B68]'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {cand.eligible ? 'Eligible' : 'Ineligible'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#596B69]">~{Math.round(cand.travelSeconds / 60)}m</td>
                    <td className="py-2 px-3 font-bold text-[#172B2A]">~{Math.round(cand.timeToCareSeconds / 60)}m</td>
                    <td className="py-2 px-3 font-semibold text-[#174C49]">{cand.readiness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
