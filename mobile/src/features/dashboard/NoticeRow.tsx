import { legacyAnswerCopy, type ClaimView } from '@shared/lib/claims';
import { formatDeadline } from '@shared/lib/utils';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, Text, View, type HostInstance } from 'react-native';

import { AppText, Button, Notice } from '@/components/ui';
import { claim as claimCopy } from '@/copy/claim';
import { dashboard } from '@/copy/dashboard';
import { fictionalRowText, notices } from '@/copy/notices';
import { fillCopy, shared } from '@/copy/shared';
import { AddConfirmationForm } from '@/features/claim/AddConfirmationForm';
import { ExternalTextLink } from '@/features/shared';
import { toSafeWebUrl } from '@/lib/external-link';
import { colors, fontFamilies, radii, space } from '@/theme/tokens';

import type { NoticeAnswer } from './notice-rows';
import type { NoticeItem } from './types';
import type { NoticeAnswerKind } from './use-notice-answers';

export interface NoticeRowProps {
  item: NoticeItem;
  answer: NoticeAnswer | undefined;
  /** The answer being saved for this row. */
  busy: NoticeAnswerKind | undefined;
  error: string | undefined;
  onAnswer: (item: NoticeItem, kind: NoticeAnswerKind) => void;
  /** The confirmation number was saved from this row (after "I already filed"). */
  onNumberSaved: (item: NoticeItem, claim: ClaimView, message: string) => void;
  /** Receives screen-reader focus after "Show all" reveals this row. */
  focusRef?: Ref<HostInstance>;
}

function actionLabel(label: string, title: string): string {
  return fillCopy(dashboard.actionFor.text, { label, title });
}

/**
 * One row of the dashboard's corrective notice (CorrectiveNoticeList): the
 * settlement, then what to do and the one-tap answers, or, once answered,
 * the confirmation. A legacy claim answered "I already filed" asks for the
 * confirmation number right in the row (the web's AnsweredRow with
 * AddConfirmationForm); once saved, the row says so.
 */
export function NoticeRow({ item, answer, busy, error, onAnswer, onNumberSaved, focusRef }: NoticeRowProps) {
  return (
    <View style={styles.row} testID={`notice-${item.claimId}`}>
      <View ref={focusRef} accessible accessibilityLabel={item.title}>
        <AppText variant="bodyStrong">{item.title}</AppText>
      </View>
      {answer ? (
        <>
          <Notice tone="success" body={answer.message} announce={answer.announce} />
          {answer.claim.status === 'reported_filed' ? (
            <AddConfirmationForm
              claimId={item.claimId}
              submitAccessibilityLabel={actionLabel(claimCopy.addNumber.text, item.title)}
              onSaved={(claim, message) => onNumberSaved(item, claim, message)}
            />
          ) : null}
        </>
      ) : item.kind === 'fictional' ? (
        <>
          <AppText variant="caption" color="textMuted">
            {fictionalRowText()}
          </AppText>
          <Button
            label={notices.gotIt.text}
            variant="secondary"
            loading={busy === 'got_it'}
            accessibilityLabel={actionLabel(notices.gotIt.text, item.title)}
            onPress={() => onAnswer(item, 'got_it')}
          />
        </>
      ) : (
        <LegacyAnswers item={item} busy={busy} onAnswer={onAnswer} />
      )}
      {error && !answer ? <Notice tone="error" body={error} /> : null}
    </View>
  );
}

function LegacyAnswers({
  item,
  busy,
  onAnswer,
}: {
  item: NoticeItem;
  busy: NoticeAnswerKind | undefined;
  onAnswer: (item: NoticeItem, kind: NoticeAnswerKind) => void;
}) {
  const copy = legacyAnswerCopy(item.filing, Boolean(item.deadline));
  return (
    <>
      <LegacyGuidance item={item} />
      <View style={styles.answers}>
        <Button
          label={notices.alreadyFiled.text}
          loading={busy === 'filed'}
          disabled={busy === 'not_yet'}
          accessibilityLabel={actionLabel(notices.alreadyFiled.text, item.title)}
          onPress={() => onAnswer(item, 'filed')}
        />
        <Button
          label={copy.notYetLabel}
          variant="secondary"
          loading={busy === 'not_yet'}
          disabled={busy === 'filed'}
          accessibilityLabel={actionLabel(copy.notYetLabel, item.title)}
          onPress={() => onAnswer(item, 'not_yet')}
        />
      </View>
    </>
  );
}

/**
 * What to do about one legacy claim (LegacyClaimGuidance): file while our
 * list shows it open, or check the official site while it is re-checked,
 * and never file twice. The official link opens in the in-app browser.
 */
export function LegacyGuidance({ item }: { item: NoticeItem }) {
  const officialUrl = toSafeWebUrl(item.officialUrl);
  const noLink = !officialUrl && item.filing !== 'deadline_passed' ? ` ${notices.noOfficialLink.text}` : '';
  const linkLabel = item.filing === 'open' ? notices.openClaimForm.text : notices.checkOfficialSite.text;

  let first: ReactNode;
  if (item.filing === 'deadline_passed') {
    first = (
      <>
        {notices.deadlineWas.text} <Text style={styles.strong}>{formatDeadline(item.deadline)}</Text>
        {notices.deadlineWasTail.text}
      </>
    );
  } else if (item.filing === 'open') {
    first = (
      <>
        <Text style={styles.strong}>{notices.haventFiledYet.text}</Text> {notices.stillCan.text}
        {item.deadline ? (
          <>
            {' '}
            {notices.beforeTheDeadline.text} <Text style={styles.strong}>{formatDeadline(item.deadline)}</Text>
          </>
        ) : null}
        .{noLink}
      </>
    );
  } else {
    const where = item.filing === 'closed_on_list' ? notices.closedOnList.text : notices.unlisted.text;
    first = (
      <>
        <Text style={styles.strong}>{notices.haventFiledYet.text}</Text> {where} {notices.checkStillTakes.text}
        {noLink}
      </>
    );
  }

  return (
    <View style={styles.guidance}>
      <AppText variant="caption" color="warning">
        {first}
      </AppText>
      {officialUrl && item.filing !== 'deadline_passed' ? (
        <ExternalTextLink
          url={officialUrl}
          label={linkLabel}
          accessibilityLabel={fillCopy(shared.linkForTitle.text, { label: linkLabel, title: item.title })}
          tone="warning"
        />
      ) : null}
      <AppText variant="caption" color="warning">
        <Text style={styles.strong}>{notices.alreadyFiledThere.text}</Text> {notices.dontFileAgain.text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space[3],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.surface,
  },
  answers: {
    gap: space[2],
  },
  guidance: {
    gap: space[2],
  },
  strong: {
    fontFamily: fontFamilies.sansBold,
  },
});
