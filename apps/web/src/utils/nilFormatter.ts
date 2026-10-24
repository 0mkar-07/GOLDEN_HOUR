/**
 * Stage 2: Tabular Hospital Data and Precise NIL Semantics
 *
 * Strict semantic differentiation:
 * - null / undefined: "NIL" (Not supplied / unverified data)
 * - 0: Confirmed zero capacity (e.g. 0 beds available)
 * - false: Confirmed unsupported / not present ("No")
 * - true: Confirmed supported / present ("Yes")
 * - NOT_APPLICABLE: Explicitly non-applicable ("N/A")
 */

export interface FormattedNil {
  text: string;
  isNil: boolean;
  explanation: string;
  badgeClass: string;
}

export function formatNil(
  value: number | boolean | string | null | undefined,
  unit?: string | null,
  context?: string
): FormattedNil {
  if (value === null || value === undefined) {
    return {
      text: 'NIL',
      isNil: true,
      explanation: 'Not supplied / unverified data',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700/60 font-mono text-xs px-2 py-0.5 rounded',
    };
  }

  if (typeof value === 'boolean') {
    if (value) {
      return {
        text: 'Yes',
        isNil: false,
        explanation: 'Confirmed supported capability',
        badgeClass: 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 text-xs px-2 py-0.5 rounded font-medium',
      };
    } else {
      return {
        text: 'No',
        isNil: false,
        explanation: 'Confirmed not supported / absent',
        badgeClass: 'bg-slate-900 text-slate-500 border border-slate-800 text-xs px-2 py-0.5 rounded',
      };
    }
  }

  if (typeof value === 'number') {
    if (value === 0) {
      return {
        text: unit ? `0 ${unit}` : '0',
        isNil: false,
        explanation: 'Confirmed 0 available capacity (exhausted)',
        badgeClass: 'bg-red-950/60 text-red-300 border border-red-800/60 text-xs px-2 py-0.5 rounded font-mono font-medium',
      };
    } else {
      return {
        text: unit ? `${value} ${unit}` : String(value),
        isNil: false,
        explanation: `${value} units currently available`,
        badgeClass: 'bg-cyan-950/70 text-cyan-300 border border-cyan-700/60 text-xs px-2 py-0.5 rounded font-mono font-semibold',
      };
    }
  }

  if (value === 'NOT_APPLICABLE') {
    return {
      text: 'N/A',
      isNil: false,
      explanation: 'Not applicable to facility type',
      badgeClass: 'bg-slate-900 text-slate-500 border border-slate-800 text-xs px-2 py-0.5 rounded',
    };
  }

  return {
    text: String(value),
    isNil: false,
    explanation: String(context || 'Recorded value'),
    badgeClass: 'bg-slate-800 text-slate-300 border border-slate-700 text-xs px-2 py-0.5 rounded',
  };
}
