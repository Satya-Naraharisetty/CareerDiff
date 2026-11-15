/**
 * Score color theming and tier mapping utility for CareerDiff.
 * Maps 0-100 scores (ATS Compatibility, Dimension Breakdown, Verbal Delivery)
 * to consistent Tailwind classes and SVG hex strokes.
 */

export interface ScoreTheme {
  text: string;
  bg: string;
  badge: string;
  border: string;
  stroke: string;
  tier: string;
  ringBorder: string;
  ringBg: string;
}

export function getScoreTheme(score: number): ScoreTheme {
  const normalized = Math.min(100, Math.max(0, score));
  if (normalized >= 80) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-400',
      badge: 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400',
      border: 'border-emerald-800/80',
      stroke: '#34d399',
      tier: 'Strong Match',
      ringBorder: 'border-emerald-500/30',
      ringBg: 'bg-emerald-950/40',
    };
  }
  if (normalized >= 65) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-400',
      badge: 'bg-amber-950/70 border-amber-800/80 text-amber-400',
      border: 'border-amber-800/80',
      stroke: '#fbbf24',
      tier: 'Moderate Match',
      ringBorder: 'border-amber-500/30',
      ringBg: 'bg-amber-950/40',
    };
  }
  return {
    text: 'text-rose-400',
    bg: 'bg-rose-400',
    badge: 'bg-rose-950/70 border-rose-800/80 text-rose-400',
    border: 'border-rose-800/80',
    stroke: '#f87171',
    tier: 'Needs Work',
    ringBorder: 'border-rose-500/30',
    ringBg: 'bg-rose-950/40',
  };
}
