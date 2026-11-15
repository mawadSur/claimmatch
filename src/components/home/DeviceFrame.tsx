import type { ReactNode } from 'react';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import { SITE, cn } from '@/lib/utils';

/** A real app screenshot in /public/screens (sizes are the file's pixel size). */
export interface Screen {
  src: string;
  alt: string;
  width: number;
  height: number;
}

function siteHost(): string {
  try {
    return new URL(SITE.url).host.replace(/^www\./, '');
  } catch {
    return 'Lawsuit AI';
  }
}

/** A light browser window around a desktop screenshot. */
export function BrowserFrame({
  screen,
  path = '/',
  priority = false,
  sizes = '(min-width: 1024px) 40rem, 100vw',
  className,
}: {
  screen: Screen;
  path?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-xl bg-white shadow-device ring-1 ring-slate-900/5',
        className,
      )}
    >
      <div
        aria-hidden
        className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-2.5"
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-[17rem] items-center justify-center gap-1.5 truncate rounded-md bg-white px-3 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
          <Lock className="h-3 w-3 shrink-0" />
          {siteHost()}
          {path}
        </div>
        <div className="w-[2.625rem]" />
      </div>
      <Image
        src={screen.src}
        alt={screen.alt}
        width={screen.width}
        height={screen.height}
        sizes={sizes}
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  );
}

/**
 * A phone bezel with a status bar. Pass a screen, or children to stack
 * several screens in the same frame (see HowItWorks).
 */
export function PhoneFrame({
  screen,
  children,
  priority = false,
  sizes = '18rem',
  className,
}: {
  screen?: Screen;
  children?: ReactNode;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'relative rounded-[2.75rem] bg-brand-900 p-[0.55rem] shadow-device ring-1 ring-white/10',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[2.25rem] bg-white">
        <div
          aria-hidden
          className="relative flex h-8 items-center justify-between bg-white px-6 text-[11px] font-semibold text-ink"
        >
          <span className="tabular">9:41</span>
          <span className="absolute left-1/2 top-1.5 h-5 w-[34%] -translate-x-1/2 rounded-full bg-brand-900" />
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-px">
              <span className="h-1 w-[3px] rounded-sm bg-ink" />
              <span className="h-1.5 w-[3px] rounded-sm bg-ink" />
              <span className="h-2 w-[3px] rounded-sm bg-ink" />
              <span className="h-2.5 w-[3px] rounded-sm bg-ink" />
            </span>
            <span className="ml-1 h-2.5 w-5 rounded-[3px] border border-ink/70 p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-ink" />
            </span>
          </span>
        </div>
        {screen ? (
          <Image
            src={screen.src}
            alt={screen.alt}
            width={screen.width}
            height={screen.height}
            sizes={sizes}
            priority={priority}
            className="block h-auto w-full"
          />
        ) : (
          children
        )}
      </div>
    </figure>
  );
}
