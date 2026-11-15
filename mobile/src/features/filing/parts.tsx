/**
 * Small shared pieces of the app's one-click screens (the web's
 * src/components/filing/ui.tsx): Jev's hints under a field, a status or
 * error line, muted text and the gray text panel. The member always ticks
 * boxes themselves: nothing here starts checked.
 */
import type { JevIssueView } from '@shared/lib/filing/v2/contract';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Notice } from '@/components/ui';
import { CircleAlert, Info } from '@/components/ui/icons';
import { colors, radii, space, typography, type TextColorToken } from '@/theme/tokens';

const ISSUE_COLOR: Record<JevIssueView['severity'], TextColorToken> = {
  block: 'danger',
  warn: 'warning',
  info: 'textMuted',
};

/** Jev's hints for one field, right under it. */
export function FieldIssues({ issues, testID }: { issues: readonly JevIssueView[]; testID?: string }) {
  if (issues.length === 0) return null;
  return (
    <View style={styles.issues} testID={testID}>
      {issues.map((issue) => (
        <View key={`${issue.rule_id}-${issue.code}-${issue.field ?? ''}`} style={styles.issue}>
          <View style={styles.issueIcon}>
            <Icon
              icon={issue.severity === 'info' ? Info : CircleAlert}
              size="sm"
              color={issue.severity === 'block' ? 'dangerIcon' : issue.severity === 'warn' ? 'warningIcon' : 'textMuted'}
            />
          </View>
          <AppText variant="caption" color={ISSUE_COLOR[issue.severity]} style={styles.grow}>
            {issue.message}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** A status or error line under a form (errors are announced right away). */
export function Message({ tone, text, testID }: { tone: 'error' | 'success'; text: string | null | undefined; testID?: string }) {
  if (!text) return null;
  return <Notice tone={tone} body={text} testID={testID} />;
}

export function Muted({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <AppText variant="caption" color="textMuted" testID={testID}>
      {children}
    </AppText>
  );
}

/** Official text shown word for word (class definition, sworn statement, consent texts). */
export function Quote({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={styles.quote} testID={testID}>
      <AppText variant="caption" color="text">
        {text}
      </AppText>
    </View>
  );
}

/** A small heading inside a card. */
export function SubHeading({ text }: { text: string }) {
  return (
    <AppText variant="label" accessibilityRole="header">
      {text}
    </AppText>
  );
}

/** A labeled value, as in the web's <dt>/<dd> lists. */
export function ValueRow({ label, value, trailing }: { label: string; value: string; trailing?: ReactNode }) {
  return (
    <View style={styles.valueRow}>
      <View style={styles.grow}>
        <AppText variant="badge" color="textMuted">
          {label}
        </AppText>
        <AppText variant="caption" color="text">
          {value}
        </AppText>
      </View>
      {trailing}
    </View>
  );
}

export const filingStyles = StyleSheet.create({
  stack: { gap: space[3] },
  tight: { gap: space[2] },
  section: {
    gap: space[3],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  warning: {
    gap: space[2],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSurface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});

const styles = StyleSheet.create({
  issues: { gap: space[1] },
  issue: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  issueIcon: { minHeight: typography.caption.lineHeight, justifyContent: 'center' },
  grow: { flex: 1 },
  quote: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderLeftWidth: 4,
    borderLeftColor: colors.borderBrand,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
