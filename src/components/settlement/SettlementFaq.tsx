import { HelpCircle } from 'lucide-react';
import type { FaqItem } from '@/lib/settlement-seo';

export function SettlementFaq({ items }: { items: FaqItem[] }) {
  return (
    <section className="mt-10" aria-labelledby="settlement-faq-heading">
      <h2 id="settlement-faq-heading" className="text-xl font-bold">
        Frequently asked questions
      </h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-card"
          >
            <summary className="flex cursor-pointer list-none items-start gap-2 text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
              <span>{item.q}</span>
            </summary>
            <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
