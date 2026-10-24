import React, { useState, useEffect } from 'react';
import {
  DiversionPreviewDto,
  DiversionComparisonDto,
} from '@goldenhour/contracts';
import {
  AlertOctagon,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
  X,
  Navigation,
  ShieldAlert,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';

interface DeteriorationDiversionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  currentDestinationName: string;
  currentDestinationVersion: number;
  onConfirmDiversion: (targetHospitalId: string, reason: string, previewId?: string) => Promise<void>;
}

const REASON_PRESETS = [
  'Acute respiratory decompensation (SpO2 < 85%)',
  'Hemodynamic instability / severe refractory hypotension',
  'Rapid neurological deterioration / GCS drop',
  'Cardiac arrest risk / urgent airway intervention required',
];

export const DeteriorationDiversionDialog: React.FC<DeteriorationDiversionDialogProps> = ({
  isOpen,
  onClose,
  caseId,
  currentDestinationName,
  currentDestinationVersion,
  onConfirmDiversion,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DiversionPreviewDto | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [selectedPresetReason, setSelectedPresetReason] = useState<string>(REASON_PRESETS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiClient.getDiversionPreview(caseId);
        if (mounted) {
          setPreview(res.preview);
          const defaultTarget =
            res.preview.suggestedTargetHospitalId ||
            res.preview.candidates.find((c) => c.eligible)?.hospitalId ||
            '';
          setSelectedHospitalId(defaultTarget);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'Failed to fetch diversion preview comparison');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPreview();
    return () => {
      mounted = false;
    };
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedHospitalId) {
      setError('Please select an eligible stabilization facility.');
      return;
    }
    const finalReason = customReason.trim()
      ? `${selectedPresetReason}: ${customReason.trim()}`
      : selectedPresetReason;

    try {
      setSubmitting(true);
      setError(null);
      await onConfirmDiversion(selectedHospitalId, finalReason, preview?.previewId);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm diversion');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCandidate = preview?.candidates.find((c) => c.hospitalId === selectedHospitalId);
  const suggestedCandidate = preview?.candidates.find(
    (c) => c.hospitalId === preview.suggestedTargetHospitalId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-[#DCE5E3] w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#FFF8E6] border-b border-[#F3E5AB] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#8A5800]/10 rounded-xl text-[#8A5800]">
              <AlertOctagon className="w-5 h-5 text-[#8A5800]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#172B2A] flex items-center gap-2">
                Patient Deteriorating — In-Transit Diversion Review
              </h2>
              <p className="text-xs text-[#8A5800]">
                Evaluate nearest reachable stabilization facilities from current ambulance position
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-[#596B69] hover:bg-black/5 transition"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Destination Context */}
          <div className="p-3.5 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-[11px] font-semibold text-[#596B69] uppercase tracking-wider block">
                Current Confirmed Destination
              </span>
              <span className="font-bold text-sm text-[#172B2A]">{currentDestinationName}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-[#596B69] uppercase tracking-wider block">
                Current Road ETA
              </span>
              <span className="font-bold text-sm text-[#172B2A]">
                {preview?.currentDestinationEtaSeconds !== null && preview?.currentDestinationEtaSeconds !== undefined
                  ? `~${Math.round(preview.currentDestinationEtaSeconds / 60)} min`
                  : 'En route'}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#596B69] space-y-2">
              <div className="w-6 h-6 border-2 border-[#176B68] border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Evaluating reachable stabilization candidates from live GPS coordinate...</p>
            </div>
          ) : (
            <>
              {/* Highlight Nearest Alternative Banner */}
              {suggestedCandidate && (
                <div className="p-3.5 bg-[#EAF5F2] border border-[#176B68]/30 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <Navigation className="w-4 h-4 text-[#176B68] shrink-0" />
                    <div>
                      <span className="font-bold text-[#174C49] text-xs">
                        Nearest eligible alternative: {suggestedCandidate.name} — ~{Math.round(suggestedCandidate.travelSeconds / 60)} min
                      </span>
                      <p className="text-[11px] text-[#596B69]">
                        Shortest road transit time from current coordinates.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-[#DCE5E3] text-[#176B68] font-bold text-[11px] rounded-full">
                    Recommended Target
                  </span>
                </div>
              )}

              {/* Candidates Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#172B2A] block">
                  Select Stabilization Facility:
                </label>

                {preview?.candidates && preview.candidates.length > 0 ? (
                  <div className="space-y-2.5">
                    {preview.candidates.map((cand) => {
                      const isSelected = selectedHospitalId === cand.hospitalId;
                      const isSuggested = cand.hospitalId === preview.suggestedTargetHospitalId;

                      return (
                        <div
                          key={cand.hospitalId}
                          onClick={() => {
                            if (cand.eligible) setSelectedHospitalId(cand.hospitalId);
                          }}
                          className={`p-3.5 rounded-xl border transition-all text-xs ${
                            !cand.eligible
                              ? 'bg-[#F6F8F8]/60 border-[#DCE5E3] opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-[#EAF5F2]/40 border-2 border-[#176B68] shadow-xs cursor-pointer'
                              : 'bg-white border-[#DCE5E3] hover:border-[#176B68]/40 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <input
                                type="radio"
                                name="diversionTarget"
                                checked={isSelected}
                                disabled={!cand.eligible}
                                onChange={() => setSelectedHospitalId(cand.hospitalId)}
                                className="mt-1 text-[#176B68] focus:ring-[#176B68]"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-[#172B2A]">{cand.name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F6F8F8] border border-[#DCE5E3] text-[#596B69]">
                                    {cand.code}
                                  </span>
                                  {isSuggested && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#174C49] text-white">
                                      Fastest ETA
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 mt-1 text-[11px] text-[#596B69]">
                                  <span className="flex items-center gap-1 font-semibold text-[#172B2A]">
                                    <Clock className="w-3 h-3 text-[#176B68]" />
                                    Road ETA: ~{Math.round(cand.travelSeconds / 60)} min
                                  </span>
                                  <span>Intake delay: +{Math.round(cand.receivingDelaySeconds / 60)} min</span>
                                  <span className="font-bold text-[#174C49]">
                                    Time to Care: ~{Math.round(cand.timeToCareSeconds / 60)} min
                                  </span>
                                </div>

                                {/* Limitations / Rejection Reason */}
                                {cand.eligible ? (
                                  cand.limitations.length > 0 && (
                                    <div className="mt-2 text-[11px] text-[#8A5800] bg-[#FFF8E6] p-2 rounded-lg border border-[#F3E5AB]">
                                      {cand.limitations.join('; ')}
                                    </div>
                                  )
                                ) : (
                                  <div className="mt-2 text-[11px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                                    Ineligible: {cand.rejectionReason}
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                cand.eligible
                                  ? 'bg-[#EAF5F2] text-[#237048] border border-[#DCE5E3]'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {cand.eligible ? 'Stabilization Eligible' : 'Ineligible'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-[#F6F8F8] border border-[#DCE5E3] rounded-xl text-center text-xs text-[#596B69]">
                    No reachable alternative stabilization facilities found within current driving radius.
                  </div>
                )}
              </div>

              {/* Crew Deterioration Reason Selection */}
              <div className="space-y-2.5 pt-2 border-t border-[#DCE5E3]">
                <label className="text-xs font-bold text-[#172B2A] block">
                  Reported Clinical Deterioration Reason:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {REASON_PRESETS.map((preset) => (
                    <label
                      key={preset}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        selectedPresetReason === preset
                          ? 'bg-[#EAF5F2] border-[#176B68] text-[#174C49] font-semibold'
                          : 'bg-white border-[#DCE5E3] text-[#596B69] hover:bg-[#F6F8F8]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="presetReason"
                        checked={selectedPresetReason === preset}
                        onChange={() => setSelectedPresetReason(preset)}
                        className="text-[#176B68] focus:ring-[#176B68]"
                      />
                      <span className="text-[11px] leading-tight">{preset}</span>
                    </label>
                  ))}
                </div>

                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Optional additional clinical observations (e.g. SpO2 78%, tachycardic to 140)..."
                  className="w-full text-xs p-2.5 bg-white border border-[#DCE5E3] rounded-xl focus:outline-hidden focus:border-[#176B68]"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#F6F8F8] border-t border-[#DCE5E3] flex items-center justify-between gap-3 sticky bottom-0 z-10">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-white border border-[#DCE5E3] hover:bg-[#F6F8F8] text-[#172B2A] text-xs font-semibold rounded-xl transition"
          >
            Keep Current Destination
          </button>

          <button
            onClick={handleConfirm}
            disabled={submitting || !selectedHospitalId || loading}
            className="px-5 py-2.5 bg-[#8A5800] hover:bg-[#724800] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            {submitting
              ? 'Confirming Diversion...'
              : `Confirm Diversion to ${selectedCandidate?.name || 'Selected Facility'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
