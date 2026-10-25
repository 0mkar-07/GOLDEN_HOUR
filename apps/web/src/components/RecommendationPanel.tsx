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
  Route,
  Activity,
} from 'lucide-react';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'N/A';
  if (seconds === 0) return '0m';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return 'N/A';
  return `${(meters / 1000).toFixed(1)} km`;
}

export const TimingBreakdownCard: React.FC<{
  candidate: CandidateEvaluationDto;
}> = ({ candidate }) => {
  const [showFormula, setShowFormula] = React.useState(false);

  const roadDist = candidate.roadDistanceMeters;
  const travelSec = candidate.travelSeconds;
  const waitSec = candidate.waitAfterArrivalSeconds ?? 0;
  const intakeSec = candidate.receivingDelaySeconds ?? 0;
  const careStartSec = candidate.timeToCareSeconds;
  const limiting = candidate.limitingReason;

  const immCareSec = candidate.immediateCareStartSeconds;
  const defCareSec = candidate.definitiveCareStartSeconds;
  const theatreWait = candidate.theatreWaitSeconds ?? 0;
  const teamReady = candidate.specialistTeamReady;

  return (
    <div className="p-3 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[#596B69]">
        <div className="flex justify-between items-center">
          <span>Road Distance:</span>
          <span className="font-semibold text-[#172B2A]">
            {roadDist ? formatDistance(roadDist) : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span>Travel ETA:</span>
          <span className="font-bold text-[#237048]">{formatDuration(travelSec)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Intake Delay:</span>
          <span className="text-[#172B2A]">+{formatDuration(intakeSec)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Service Readiness:</span>
          <span
            className={
              candidate.theatreReady === false || theatreWait > 0 || teamReady === false
                ? 'text-[#8A5800] font-bold'
                : 'text-[#237048] font-semibold'
            }
          >
            {theatreWait > 0
              ? `+${formatDuration(theatreWait)} turnover`
              : teamReady === false
              ? 'Team on-call / mobilizing'
              : 'Ready now'}
          </span>
        </div>
        {immCareSec !== null && immCareSec !== undefined && (
          <div className="flex justify-between items-center col-span-2 pt-1 border-t border-[#E2E8F0]">
            <span className="text-[#596B69]">Immediate Stabilisation:</span>
            <span className="font-bold text-[#176B68]">~{formatDuration(immCareSec)}</span>
          </div>
        )}
        {defCareSec !== null && defCareSec !== undefined && (
          <div className="flex justify-between items-center col-span-2">
            <span className="text-[#596B69]">Definitive Care Start:</span>
            <span className="font-bold text-[#174C49]">~{formatDuration(defCareSec)}</span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[#DCE5E3] flex justify-between items-center text-xs font-bold">
        <span className="text-[#174C49] flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-[#176B68]" />
          Estimated Care Start:
        </span>
        <span className="text-[#172B2A] text-sm font-extrabold">~{formatDuration(careStartSec)}</span>
      </div>

      {limiting && (
        <div className="text-[11px] text-[#596B69] bg-white p-2 rounded-lg border border-[#E2E8F0] flex items-center justify-between">
          <span className="text-[#8A5800] font-medium truncate" title={limiting}>
            Limiting factor: {limiting}
          </span>
          <button
            type="button"
            onClick={() => setShowFormula(!showFormula)}
            className="text-[10px] text-[#176B68] hover:underline shrink-0 ml-1 font-semibold"
          >
            {showFormula ? 'Hide' : 'Explain'}
          </button>
        </div>
      )}

      {showFormula && (
        <div className="p-2 bg-white rounded-lg border border-[#DCE5E3] text-[10px] font-mono text-[#596B69] space-y-0.5">
          <div className="text-[#174C49] font-bold">Time-to-Care Formula:</div>
          <div>Care Start = max(Travel ETA, Service Ready) + Intake</div>
          <div>= max({travelSec}s, {travelSec + waitSec}s) + {intakeSec}s</div>
          <div>= {careStartSec}s (~{formatDuration(careStartSec)})</div>
        </div>
      )}

      <div className="flex justify-between items-center pt-1 text-[10px] text-[#596B69]">
        <span>Routing Provider:</span>
        <span className="font-semibold px-2 py-0.5 rounded bg-white border border-[#DCE5E3] text-[#172B2A]">
          {candidate.routingSource === 'GOOGLE_ROUTES'
            ? 'Google Routes (Live)'
            : candidate.routingSource === 'LIVE_OSRM'
            ? 'Live OSRM'
            : candidate.routingSource === 'FALLBACK_GRAPH'
            ? 'Fallback Graph'
            : 'Simulated Road Graph'}
        </span>
      </div>
    </div>
  );
};

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
          Confirm patient clinical requirements above to run Agent 2 (Suitability Filtering) and Agent 3 (Time &amp; Coordination Ranking).
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
            <Navigation className="w-5 h-5 text-[#176B68]" />
            Tri-Agent Destination Recommendations
          </h2>
          <p className="text-xs text-[#596B69] mt-0.5">
            Agent 2 (Verified Capabilities &amp; Surgical Teams) + Agent 3 (Time-to-Care Dynamic Ranking)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {recommendation.evaluationMode && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                recommendation.evaluationMode === 'LLM_ASSISTED'
                  ? 'bg-[#EAF5F2] text-[#176B68] border-[#DCE5E3]'
                  : recommendation.evaluationMode === 'WAITING_FOR_DATA'
                  ? 'bg-[#FFF8E6] text-[#8A5800] border-[#F3E5AB]'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {recommendation.evaluationMode}
            </span>
          )}

          {recommendation.routeSnapshotId && (
            <span className="text-[10px] font-mono text-[#596B69] hidden md:inline px-1.5 py-0.5 bg-[#F6F8F8] rounded border border-[#DCE5E3]">
              {recommendation.routeSnapshotId.slice(0, 16)}...
            </span>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#172B2A] text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      </div>

      {/* Confirmed Care Objective & Pathway Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
          recommendation.selectedPathway === 'STABILIZE_THEN_TRANSFER'
            ? 'bg-[#FFF8E6] border-[#F3E5AB] text-[#8A5800]'
            : 'bg-[#EAF5F2] border-[#DCE5E3] text-[#174C49]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white rounded-lg border border-current shrink-0">
            {recommendation.selectedPathway === 'STABILIZE_THEN_TRANSFER' ? (
              <AlertTriangle className="w-5 h-5 text-[#8A5800]" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#176B68]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider">
                {recommendation.selectedPathway === 'STABILIZE_THEN_TRANSFER'
                  ? 'Confirmed Care Objective: Immediate Stabilisation First'
                  : 'Confirmed Care Objective: Direct Definitive Care'}
              </span>
              {recommendation.assessmentVersion && (
                <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-mono font-bold border border-current">
                  Assessment v{recommendation.assessmentVersion}
                </span>
              )}
            </div>
            <p className="text-xs text-[#172B2A] mt-0.5">
              {recommendation.selectedPathway === 'STABILIZE_THEN_TRANSFER'
                ? 'Immediate stabilisation is recommended under the confirmed plan; definitive specialist treatment remains a separate next step.'
                : 'Direct transport to definitive care facility is permitted under clinical assessment.'}
            </p>
          </div>
        </div>

        {recommendation.onwardTransfer && (
          <div className="bg-white px-3 py-2 rounded-lg border border-[#F3E5AB] text-xs space-y-0.5 shrink-0">
            <span className="text-[10px] font-bold text-[#596B69] uppercase tracking-wider block">
              Subsequent Definitive Target
            </span>
            <span className="font-bold text-[#172B2A] block">
              {recommendation.onwardTransfer.destinationName || recommendation.onwardTransfer.destinationHospitalId}
            </span>
            <span className="text-[10px] text-[#8A5800] block italic">
              Onward transfer timing not confirmed
            </span>
          </div>
        )}
      </div>

      {/* Why This Recommendation Changed Banner & Reason Code Pills */}
      {recommendation.whyChanged && (
        <div className="p-3.5 bg-[#EFF8FF] border border-[#B2DDFF] rounded-xl flex items-start gap-3 shadow-xs">
          <div className="p-1.5 bg-white rounded-lg border border-[#B2DDFF] text-[#175CD3] shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div className="space-y-1 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#175CD3]">
              Why Recommendation Changed
            </span>
            <p className="text-xs text-[#182230] leading-relaxed font-medium">
              {recommendation.whyChanged}
            </p>
            {recommendation.policyReasonCodes && recommendation.policyReasonCodes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-[#596B69] uppercase tracking-wider mr-1">
                  Policy Decisions:
                </span>
                {recommendation.policyReasonCodes.map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-[#175CD3] border border-[#B2DDFF]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

                {/* 5-Component Timing Breakdown Card */}
                <TimingBreakdownCard candidate={hospitalB} />

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

                {/* 5-Component Timing Breakdown Card */}
                <TimingBreakdownCard candidate={hospitalC} />

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
          {/* Destination A: Recommended Definitive-Care Option */}
          <div className="bg-white border-2 border-[#176B68] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="bg-[#EAF5F2] px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#174C49] text-white text-[10px] font-bold uppercase tracking-wider">
                  Recommended now • Primary (A)
                </span>
                <span className="text-xs font-bold text-[#172B2A]">Definitive-care option</span>
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

                  {/* 5-Component Timing Breakdown Card */}
                  <TimingBreakdownCard candidate={hospitalA} />

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
                  {dispatching
                    ? 'Dispatching & Notifying...'
                    : `Dispatch Ambulance to Hospital A (${hospitalA.name} - Recommended)`}
                </button>
              )}
            </div>
          </div>

          {/* Destination B: Dynamic Stabilization Backup */}
          <div className="bg-white border border-[#DCE5E3] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="bg-white px-4 py-3 border-b border-[#DCE5E3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#EAF5F2] text-[#176B68] border border-[#DCE5E3] text-[10px] font-bold uppercase tracking-wider">
                  Contingency • Backup (B)
                </span>
                <span className="text-xs font-bold text-[#172B2A]">Immediate Stabilisation Option</span>
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

                  {/* 5-Component Timing Breakdown Card */}
                  <TimingBreakdownCard candidate={hospitalB} />

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
                  Contingency • Backup (C)
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

                  {/* 5-Component Timing Breakdown Card */}
                  <TimingBreakdownCard candidate={hospitalC} />

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
              Synthesizes patient vitals &amp; telemetry into confirmed full-care and immediate stabilization criteria.
            </p>
          </div>

          <div className="p-3.5 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1">
            <span className="font-bold text-[#8A5800]">Agent 2 — Suitability</span>
            <p className="text-[#596B69] leading-relaxed text-[11px]">
              Filters regional hospitals by capabilities, equipment availability (Available &gt; 0), and specialist team readiness.
            </p>
          </div>

          <div className="p-3.5 bg-[#F6F8F8] rounded-xl border border-[#DCE5E3] space-y-1">
            <span className="font-bold text-[#237048]">Agent 3 — Coordination &amp; Time</span>
            <p className="text-[#596B69] leading-relaxed text-[11px]">
              Calculates shortest road path &amp; time-to-care to select Primary Destination A and current-position Backups B &amp; C.
            </p>
          </div>
        </div>

        {recommendation.allCandidates && recommendation.allCandidates.length > 0 && (
          <div className="overflow-x-auto pt-2 border-t border-[#DCE5E3]">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#DCE5E3] text-[11px] font-semibold text-[#596B69] bg-[#F6F8F8]">
                  <th className="py-2 px-3">Hospital</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Road Dist</th>
                  <th className="py-2 px-3">Travel ETA</th>
                  <th className="py-2 px-3">Post-Arrival Wait</th>
                  <th className="py-2 px-3">Intake</th>
                  <th className="py-2 px-3">Care Start</th>
                  <th className="py-2 px-3">Limiting Factor</th>
                  <th className="py-2 px-3">Routing Engine</th>
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
                    <td className="py-2 px-3 text-[#596B69]">
                      {formatDistance(cand.roadDistanceMeters)}
                    </td>
                    <td className="py-2 px-3 text-[#237048] font-medium">
                      ~{formatDuration(cand.travelSeconds)}
                    </td>
                    <td className="py-2 px-3 text-[#596B69]">
                      {(cand.waitAfterArrivalSeconds ?? 0) > 0 ? `+${formatDuration(cand.waitAfterArrivalSeconds)}` : '0m'}
                    </td>
                    <td className="py-2 px-3 text-[#596B69]">
                      +{formatDuration(cand.receivingDelaySeconds)}
                    </td>
                    <td className="py-2 px-3 font-bold text-[#172B2A]">
                      ~{formatDuration(cand.timeToCareSeconds)}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-[#8A5800] max-w-[150px] truncate" title={cand.limitingReason || 'Standard facility intake'}>
                      {cand.limitingReason || 'Standard facility intake'}
                    </td>
                    <td className="py-2 px-3 text-[10px] text-[#596B69]">
                      <span className="px-1.5 py-0.5 rounded bg-[#F6F8F8] border border-[#DCE5E3]">
                        {cand.routingSource === 'GOOGLE_ROUTES'
                          ? 'Google Routes'
                          : cand.routingSource === 'LIVE_OSRM'
                          ? 'OSRM'
                          : cand.routingSource === 'FALLBACK_GRAPH'
                          ? 'Fallback'
                          : 'Sim Graph'}
                      </span>
                    </td>
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
