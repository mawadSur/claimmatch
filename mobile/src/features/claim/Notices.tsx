import { legacyAnswerCopy, type LegacyFilingState } from '@shared/lib/claims';
import { formatDeadline } from '@shared/lib/utils';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { Info, TriangleAlert } from '@/components/ui/icons';
import { fictionalNoticeText, notices } from '@/copy/notices';
import { ExternalTextLink } from '@/features/shared';
import { colors, fontFamilies, radii, space } from '@/theme/tokens';

import { Bullet, Bullets } from './Bullets';
import { ClaimError } from './ClaimError';
import { useClaimWrites, type OnClaimChange } from './use-claim-writes';

/**
 * The notices for a claim the old flow showed as filed (D42) and for a claim
 * on a fictional settlement (src/components/claims/CorrectiveNotice.tsx).
 * Wording from @/copy/notices; the one-tap answers from legacyAnswerCopy.
 */

function Strong({ children }: { children: ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

/** What to do about one legacy claim (LegacyClaimGuidance). */
function LegacyClaimGuidance({
  deadline,
  filing,
  officialUrl,
}: {
  deadline: string | null;
  filing: LegacyFilingState;
  officialUrl: string | null;
}) {
  const date = deadline ? formatDeadline(deadline) : null;
  const noLink = !officialUrl && filing !== 'deadline_passed' ? ` ${notices.noOfficialLink.text}` : '';
  let first: ReactNode;
  let link: ReactNode = null;
  if (filing === 'deadline_passed') {
    first = (
      <>
        {notices.deadlineWas.text} <Strong>{formatDeadline(deadline)}</Strong>
        {notices.deadlineWasTail.text}
      </>
    );
  } else if (filing === 'open') {
    first = (
      <>
        <Strong>{notices.haventFiledYet.text}</Strong> {notices.stillCan.text}
        {date ? (
          <>
            {' '}
            {notices.beforeTheDeadline.text} <Strong>{date}</Strong>
          </>
        ) : null}
        .{noLink}
      </>
    );
    if (officialUrl) link = <ExternalTextLink url={officialUrl} label={notices.openClaimForm.text} tone="warning" />;
  } else {
    first = (
      <>
        <Strong>{notices.haventFiledYet.text}</Strong>{' '}
        {filing === 'closed_on_list' ? notices.closedOnList.text : notices.unlisted.text} {notices.checkStillTakes.text}
        {noLink}
      </>
    );
    if (officialUrl) link = <ExternalTextLink url={officialUrl} label={notices.checkOfficialSite.text} tone="warning" />;
  }
  return (
    <Bullets>
      <Bullet dot="warning">
        <AppText variant="caption" color="warning">
          {first}
        </AppText>
        {link}
      </Bullet>
      <Bullet dot="warning">
        <AppText variant="caption" color="warning">
          <Strong>{notices.alreadyFiledThere.text}</Strong> {notices.dontFileAgain.text}
        </AppText>
      </Bullet>
    </Bullets>
  );
}

/**
 * The one-tap answers (LegacyClaimAnswer): "I already filed" records it at
 * once (the number can be added next); "I haven’t filed yet" (after the
 * deadline, "I didn’t file") records that. Both stay reversible.
 */
function LegacyClaimAnswer({
  claimId,
  filing,
  hasDeadline,
  onAnswered,
}: {
  claimId: string;
  filing: LegacyFilingState;
  hasDeadline: boolean;
  onAnswered: OnClaimChange;
}) {
  const writes = useClaimWrites();
  const [busy, setBusy] = useState<null | 'filed' | 'not_yet'>(null);
  const [error, setError] = useState<unknown>(null);
  const answers = legacyAnswerCopy(filing, hasDeadline);

  async function answer(kind: 'filed' | 'not_yet') {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const result = await writes.changeClaim({
        claimId,
        body: { action: kind === 'filed' ? 'report_filed' : 'acknowledge_notice' },
      });
      setBusy(null);
      if (kind === 'filed') onAnswered(result.claim, answers.filedMessage, { reported: true });
      else onAnswered(result.claim, answers.notYetMessage);
    } catch (caught) {
      setBusy(null);
      setError(caught);
    }
  }

  return (
    <View style={styles.answers}>
      <Button
        label={notices.alreadyFiled.text}
        loading={busy === 'filed'}
        disabled={busy !== null}
        onPress={() => void answer('filed')}
        fullWidth
      />
      <Button
        label={answers.notYetLabel}
        variant="secondary"
        loading={busy === 'not_yet'}
        disabled={busy !== null}
        onPress={() => void answer('not_yet')}
        fullWidth
      />
      <ClaimError error={error} testID="claim-notice-error" />
    </View>
  );
}

export interface CorrectiveNoticeProps {
  claimId: string;
  deadline: string | null;
  filing: LegacyFilingState;
  officialUrl: string | null;
  onAnswered: OnClaimChange;
}

/** The corrective notice on the claim screen, for one legacy claim. */
export function CorrectiveNotice({ claimId, deadline, filing, officialUrl, onAnswered }: CorrectiveNoticeProps) {
  return (
    <View style={[styles.section, styles.amber]} testID="claim-corrective-notice">
      <View style={styles.titleRow}>
        <Icon icon={TriangleAlert} size="md" color="warningIcon" />
        <AppText variant="heading" color="warning" style={styles.flex}>
          {notices.claimTitle.text}
        </AppText>
      </View>
      <AppText variant="caption" color="warning">
        {notices.claimBody.text}
      </AppText>
      <LegacyClaimGuidance deadline={deadline} filing={filing} officialUrl={officialUrl} />
      <LegacyClaimAnswer claimId={claimId} filing={filing} hasDeadline={Boolean(deadline)} onAnswered={onAnswered} />
    </View>
  );
}

export interface FictionalNoticeProps {
  claimId: string;
  title: string;
  acknowledged: boolean;
  onAcknowledged: OnClaimChange;
}

/** For a claim on one of the fictional settlements: it was not real, nothing to do. */
export function FictionalNotice({ claimId, title, acknowledged, onAcknowledged }: FictionalNoticeProps) {
  const writes = useClaimWrites();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function acknowledge() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await writes.changeClaim({ claimId, body: { action: 'acknowledge_notice' } });
      setBusy(false);
      onAcknowledged(result.claim, notices.fictionalDone.text);
    } catch (caught) {
      setBusy(false);
      setError(caught);
    }
  }

  return (
    <View style={[styles.section, styles.gray]} testID="claim-fictional-notice">
      <View style={styles.titleRow}>
        <Icon icon={Info} size="md" color="infoIcon" />
        <AppText variant="heading" style={styles.flex}>
          {notices.fictionalTitle.text}
        </AppText>
      </View>
      <AppText variant="caption" color="textMuted">
        {fictionalNoticeText(title)}
      </AppText>
      {acknowledged ? (
        <AppText variant="bodyStrong">{notices.allSet.text}</AppText>
      ) : (
        <View style={styles.answers}>
          <Button label={notices.gotIt.text} variant="secondary" loading={busy} onPress={() => void acknowledge()} fullWidth />
          <ClaimError error={error} testID="claim-fictional-error" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
    padding: space[5],
    borderRadius: radii['2xl'],
    borderWidth: 1,
  },
  amber: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  gray: {
    backgroundColor: colors.background,
    borderColor: colors.divider,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  flex: {
    flex: 1,
  },
  strong: {
    fontFamily: fontFamilies.sansBold,
  },
  answers: {
    gap: space[2],
  },
});
