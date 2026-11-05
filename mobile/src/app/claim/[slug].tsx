import { useLocalSearchParams } from 'expo-router';

import { ClaimScreen } from '@/features/claim';
import { firstParam } from '@/features/shared';

/** /claim/{slug}: the claim flow, pushed over the tabs (plan 3.3, Claim). */
export default function ClaimRoute() {
  const { slug } = useLocalSearchParams<{ slug: string | string[] }>();
  const value = firstParam(slug) ?? '';
  // A different settlement starts from a clean screen (no earlier confirmation or form input).
  return <ClaimScreen key={value} slug={value} />;
}
