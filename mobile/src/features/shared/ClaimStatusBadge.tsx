import type { ClaimTone } from '@shared/lib/claims';
import type { StyleProp, ViewStyle } from 'react-native';

import { Badge } from '@/components/ui';

export interface ClaimStatusBadgeProps {
  /** Always from displayClaimStatus(...).label (or a dashboard row's label). */
  label: string;
  /** displayClaimStatus(...).tone. */
  tone: ClaimTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A claim status pill (src/components/claims/ClaimStatusBadge.tsx). Text wraps; read as plain text. */
export function ClaimStatusBadge({ label, tone, style, testID }: ClaimStatusBadgeProps) {
  return <Badge label={label} tone={tone} style={style} testID={testID} />;
}
