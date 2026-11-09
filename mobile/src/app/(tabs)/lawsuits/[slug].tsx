import { useLocalSearchParams } from 'expo-router';

import { SettlementScreen } from '@/features/settlement';
import { firstParam } from '@/features/shared';

/** /lawsuits/{slug}: settlement detail (plan 3.3). */
export default function SettlementRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  return <SettlementScreen slug={firstParam(slug) ?? ''} />;
}
