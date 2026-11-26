'use client';

export function PrintSummaryButton({ label = 'Print this summary' }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
