import type { HowStepIllustration } from './how-it-works-types';

/** Simple brand-colored SVGs — no stock photos, no fake customers. */
export function HowIllustration({
  kind,
  className,
}: {
  kind: HowStepIllustration;
  className?: string;
}) {
  const common = {
    viewBox: '0 0 320 240',
    role: 'img' as const,
    className,
  };

  if (kind === 'questions') {
    return (
      <svg {...common} aria-label="Illustration of answering a few match questions">
        <rect x="36" y="28" width="248" height="184" rx="24" fill="#eff6ff" stroke="#bfdbfe" />
        <rect x="64" y="56" width="192" height="18" rx="9" fill="#93c5fd" />
        <rect x="64" y="92" width="148" height="14" rx="7" fill="#dbeafe" />
        <rect x="64" y="124" width="172" height="40" rx="12" fill="#fff" stroke="#93c5fd" />
        <circle cx="84" cy="144" r="8" fill="#1d4ed8" />
        <rect x="100" y="138" width="100" height="12" rx="6" fill="#bfdbfe" />
        <rect x="64" y="180" width="120" height="16" rx="8" fill="#1d4ed8" />
      </svg>
    );
  }

  if (kind === 'matches') {
    return (
      <svg {...common} aria-label="Illustration of matched settlements in a list">
        <rect x="36" y="28" width="248" height="184" rx="24" fill="#f8fafc" stroke="#e2e8f0" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0 ${i * 52})`}>
            <rect x="56" y="48" width="208" height="40" rx="12" fill="#fff" stroke="#e2e8f0" />
            <rect x="72" y="58" width="96" height="10" rx="5" fill="#cbd5e1" />
            <rect x="72" y="74" width="64" height="8" rx="4" fill="#e2e8f0" />
            <rect x="196" y="60" width="52" height="16" rx="8" fill="#dcfce7" />
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg {...common} aria-label="Illustration of filing a claim or using Easy submit">
      <rect x="36" y="28" width="248" height="184" rx="24" fill="#eff6ff" stroke="#bfdbfe" />
      <rect x="72" y="56" width="176" height="120" rx="16" fill="#fff" stroke="#93c5fd" />
      <rect x="96" y="80" width="128" height="12" rx="6" fill="#bfdbfe" />
      <rect x="96" y="104" width="96" height="10" rx="5" fill="#dbeafe" />
      <rect x="96" y="136" width="128" height="24" rx="12" fill="#1d4ed8" />
      <path
        d="M148 144h24M160 138v12"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
