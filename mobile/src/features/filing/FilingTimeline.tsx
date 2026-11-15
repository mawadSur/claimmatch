import type { ClaimFilingView, TimelineEntry } from '@shared/lib/filing/v2/contract';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { Circle, CircleCheck, CircleDot, Copy } from '@/components/ui/icons';
import { filing as copy, preparedFilesText } from '@/copy/filing';
import { colors, space } from '@/theme/tokens';

import { displayValue } from './form';
import { filingPath, timelineRows } from './model';
import { Muted, SubHeading, ValueRow, filingStyles } from './parts';

/** Where the claim is on the path: preparing, ready, signed, in line, filing, filed, confirmation number. */
export function FilingPath({ status }: { status: string }) {
  const steps = filingPath(status);
  if (!steps) return null;
  return (
    <View style={styles.path} accessibilityLabel={copy.stepStatus.text} testID="filing-path">
      {steps.map((step) => (
        <View
          key={step.status}
          style={styles.pathStep}
          accessible
          accessibilityState={{ selected: step.state === 'current' }}
          testID={`filing-path-${step.status}-${step.state}`}
        >
          <Icon
            icon={step.state === 'done' ? CircleCheck : step.state === 'current' ? CircleDot : Circle}
            size="sm"
            color={step.state === 'done' ? 'successIcon' : step.state === 'current' ? 'primary' : 'border'}
          />
          <AppText variant="badge" color={step.state === 'upcoming' ? 'textMuted' : 'text'}>
            {step.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Every change so far with its time and who made it ("You" or "Lawsuit AI"; staff are never named). */
export function FilingTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  const rows = timelineRows(entries);
  if (rows.length === 0) return null;
  return (
    <View style={[filingStyles.section, styles.timeline]} testID="filing-timeline">
      <SubHeading text={copy.timelineTitle.text} />
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <AppText variant="badge" color="textSoft">{`${row.when} · ${row.actor}`}</AppText>
          <AppText variant="caption">{row.text}</AppText>
          {row.confirmation ? <Muted>{`#${row.confirmation}`}</Muted> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The self-file copy panel for a claim prepared in Lawsuit AI (the web's
 * PreparedAnswers): the settlement's questions and choices with the member's
 * answers, in the official form's order, each with a Copy button.
 */
export function PreparedAnswers({ view }: { view: ClaimFilingView }) {
  const [copied, setCopied] = useState<string | null>(null);
  const stored = (path: string) =>
    view.packet?.items.find((item) => item.path === path)?.proof?.documents.filter((d) => d.status === 'stored').length ?? 0;
  const answered = (view.packet?.items ?? []).filter((item) =>
    item.kind === 'member' ? false : item.kind === 'document' ? stored(item.path) > 0 : displayValue(item) !== copy.empty.text,
  );
  if (answered.length === 0) return null;

  async function copyValue(path: string, text: string) {
    try {
      await Clipboard.setStringAsync(text);
    } catch {
      return setCopied(null);
    }
    setCopied(path);
    AccessibilityInfo.announceForAccessibility(copy.copied.text);
  }

  return (
    <View style={filingStyles.section} testID="filing-prepared">
      <SubHeading text={copy.preparedTitle.text} />
      <Muted>{copy.preparedIntro.text}</Muted>
      {answered.map((item) => {
        const text = item.kind === 'document' ? preparedFilesText(stored(item.path)) : displayValue(item);
        return (
          <ValueRow
            key={item.path}
            label={item.label}
            value={text}
            trailing={
              item.kind !== 'document' ? (
                <Button
                  variant="secondary"
                  icon={Copy}
                  label={copied === item.path ? copy.copied.text : copy.copy.text}
                  accessibilityLabel={`${copy.copy.text}: ${item.label}`}
                  onPress={() => void copyValue(item.path, text)}
                  testID={`filing-copy-${item.path}`}
                />
              ) : undefined
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  path: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  pathStep: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  timeline: { backgroundColor: colors.background },
  row: { gap: space[1], paddingLeft: space[3], borderLeftWidth: 2, borderLeftColor: colors.borderBrand },
});
