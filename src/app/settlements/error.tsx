'use client';

import LawsuitsError from '@/app/lawsuits/error';

export default function SettlementsError(props: { error: Error; reset: () => void }) {
  return <LawsuitsError {...props} />;
}
