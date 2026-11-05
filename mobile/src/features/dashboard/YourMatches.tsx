import { POSSIBLE_MATCH_CAP } from '@shared/components/claims/dashboard-model';
import { matchStrengthLabel } from '@shared/lib/matching';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Icon } from '@/components/ui';
import { ArrowRight, CalendarClock, ChevronDown, ChevronUp, Sparkles, UserCog } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { dashboard, possibleIntro, possibleMatchesSummary } from '@/copy/dashboard';
import { fillCopy } from '@/copy/shared';
import { claimHref, isClaimHref } from '@/features/shared';
import { colors, radii, space, touchTarget } from '@/theme/tokens';

import { BulletList, DashedCard, IconTile, SectionError, SectionTitle } from './parts';
import type { AppMatch, DashboardResponse } from './types';
import type { DashboardNavigation } from './use-dashboard-navigation';

export interface YourMatchesProps {
  matches: DashboardResponse['matches'];
  needsProfile: boolean;
  /** The "Possible matches" group is open (kept by the screen). */
  possibleOpen: boolean;
  onTogglePossible: () => void;
  nav: DashboardNavigation;
}

/**
 * "Your matches" (src/components/claims/YourMatches.tsx): Strong first, then
 * Possible behind "Show or hide", capped by the server. Never a score: the
 * label is rebuilt from the strength ("Strong match" or "Possible match").
 * v1 shows the self-file "How to file" button only (ASSISTED_FILING and
 * MATCH_METRICS off).
 */
export function YourMatches({ matches, needsProfile, possibleOpen, onTogglePossible, nav }: YourMatchesProps) {
  const { failed, strong, possible, possibleHidden } = matches;
  const hasAny = strong.length > 0 || possible.length > 0 || possibleHidden > 0;

  let content: ReactNode;
  if (failed) {
    content = <SectionError title={dashboard.matchesFailedTitle.text} body={dashboard.matchesFailedBody.text} testID="dashboard-matches-failed" />;
  } else if (!hasAny) {
    content = <EmptyMatches needsProfile={needsProfile} nav={nav} />;
  } else {
    content = (
      <>
        <View style={styles.group}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {dashboard.strongMatches.text}
          </AppText>
          {strong.length === 0 ? (
            <DashedCard>
              <AppText variant="caption" color="textMuted">
                {dashboard.noStrongMatches.text}
              </AppText>
            </DashedCard>
          ) : (
            strong.map((match) => <MatchCard key={match.id} match={match} onOpen={nav.openClaim} />)
          )}
        </View>
        {possible.length > 0 ? (
          <View style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={possibleMatchesSummary(possible.length, possibleHidden)}
              accessibilityState={{ expanded: possibleOpen }}
              onPress={onTogglePossible}
              style={({ pressed }) => [styles.disclosure, pressed ? styles.disclosurePressed : null]}
              testID="dashboard-possible-toggle"
            >
              <View style={styles.disclosureText}>
                <AppText variant="label">{possibleMatchesSummary(possible.length, possibleHidden)}</AppText>
                <AppText variant="caption" color="textMuted">
                  {dashboard.showOrHide.text}
                </AppText>
              </View>
              <Icon icon={possibleOpen ? ChevronUp : ChevronDown} size="md" color="textMuted" />
            </Pressable>
            {possibleOpen ? (
              <>
                <AppText variant="caption" color="textMuted">
                  {possibleIntro(POSSIBLE_MATCH_CAP)}
                </AppText>
                {possible.map((match) => (
                  <MatchCard key={match.id} match={match} onOpen={nav.openClaim} />
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.section} testID="dashboard-matches">
      <SectionTitle
        title={dashboard.matchesTitle.text}
        description={dashboard.matchesIntro.text}
        action={<Button label={dashboard.editProfile.text} variant="ghost" onPress={nav.openProfileSettings} />}
      />
      {content}
    </View>
  );
}

/** One match: strength, title, deadline, the matcher's reasons and "How to file". */
function MatchCard({ match, onOpen }: { match: AppMatch; onOpen: (href: unknown) => void }) {
  const href = claimHref(match.slug);
  const label = matchStrengthLabel(match.strength);
  return (
    <Card padding={4} style={styles.card} testID={`match-${match.id}`}>
      <Badge label={label} tone={match.strength === 'strong' ? 'green' : 'brand'} icon={Sparkles} />
      <AppText variant="bodyStrong">{match.title}</AppText>
      <DeadlineLine text={match.deadlineText} />
      {match.reasons.length > 0 ? <BulletList items={match.reasons} /> : null}
      {isClaimHref(href) ? (
        <Button
          label={dashboard.howToFile.text}
          variant="secondary"
          icon={ArrowRight}
          iconPosition="trailing"
          accessibilityLabel={fillCopy(dashboard.actionFor.text, { label: dashboard.howToFile.text, title: match.title })}
          onPress={() => onOpen(href)}
        />
      ) : null}
    </Card>
  );
}

/** "Deadline Oct 15, 2026 · 12 days left", as the server words it, with the calendar icon. */
export function DeadlineLine({ text }: { text: string }) {
  return (
    <View style={styles.deadline}>
      <Icon icon={CalendarClock} size="sm" color="textLink" />
      <AppText variant="caption" color="textMuted" style={styles.deadlineText}>
        {text}
      </AppText>
    </View>
  );
}

/** No matches: finish or update the profile, or browse (EmptyMatches). */
function EmptyMatches({ needsProfile, nav }: { needsProfile: boolean; nav: DashboardNavigation }) {
  return (
    <DashedCard testID="dashboard-matches-empty">
      <View style={styles.emptyRow}>
        <IconTile icon={UserCog} />
        <View style={styles.emptyText}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {needsProfile ? dashboard.addProfileDetailsTitle.text : dashboard.noOpenMatchesTitle.text}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {needsProfile ? dashboard.addProfileDetailsBody.text : dashboard.noOpenMatchesBody.text}
          </AppText>
        </View>
      </View>
      <Button
        label={needsProfile ? dashboard.finishYourProfile.text : dashboard.updateYourProfile.text}
        icon={ArrowRight}
        iconPosition="trailing"
        onPress={needsProfile ? nav.openOnboarding : nav.openProfileSettings}
      />
      <Button label={app.browseOpenSettlements.text} variant="secondary" onPress={nav.openSettlements} />
    </DashedCard>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[4],
  },
  group: {
    gap: space[3],
  },
  card: {
    gap: space[2],
  },
  deadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  deadlineText: {
    flexShrink: 1,
  },
  disclosure: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  disclosurePressed: {
    backgroundColor: colors.surfacePressed,
  },
  disclosureText: {
    flex: 1,
    gap: space[1],
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  emptyText: {
    flex: 1,
    gap: space[1],
  },
});
