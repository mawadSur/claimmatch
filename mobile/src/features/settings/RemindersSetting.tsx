import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, ListItem, Notice } from '@/components/ui';
import { Bell } from '@/components/ui/icons';
import { settings } from '@/copy/settings';
import { useReminderSetting } from '@/data/reminder-setting';
import type { RemindersOutcome } from '@/lib/reminders';
import { space } from '@/theme/tokens';

import { SettingsGroup } from './SettingsGroup';

/**
 * The app-only "Deadline reminders" switch (plan 3.3 and 5): local
 * notifications 7 days and 1 day before each deadline. Turning it on asks for
 * the notification permission only when it is undecided. When it was refused
 * for good, a short line explains and opens the system Settings; coming back
 * with notifications allowed turns reminders on, as the person asked.
 */
export function RemindersSetting() {
  const reminders = useReminderSetting();
  const [outcome, setOutcome] = useState<RemindersOutcome | null>(null);
  const { permission, enabled, busy, ready, setEnabled } = reminders;

  function change(on: boolean) {
    setEnabled(on).then(setOutcome, () => setOutcome('unavailable'));
  }

  useEffect(() => {
    // Back from the system Settings with notifications allowed: finish turning reminders on.
    if (outcome !== 'denied' || permission !== 'granted' || enabled || busy) return;
    setEnabled(true).then(setOutcome, () => setOutcome('unavailable'));
  }, [outcome, permission, enabled, busy, setEnabled]);

  const denied = outcome === 'denied' && permission !== 'granted';

  return (
    <View style={styles.block}>
      <SettingsGroup>
        <ListItem
          icon={Bell}
          title={settings.remindersLabel.text}
          subtitle={settings.remindersHint.text}
          toggle={{ value: enabled, onValueChange: change }}
          disabled={!ready || busy}
          testID="settings-reminders"
        />
      </SettingsGroup>
      {denied ? (
        <Notice tone="info" body={settings.remindersDenied.text} announce testID="settings-reminders-denied">
          <Button
            label={settings.openSystemSettings.text}
            variant="secondary"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            style={styles.openSettings}
          />
        </Notice>
      ) : null}
      {outcome === 'unavailable' ? (
        <Notice tone="info" body={settings.remindersUnavailable.text} announce testID="settings-reminders-unavailable" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space[3],
  },
  openSettings: {
    alignSelf: 'flex-start',
    marginTop: space[2],
  },
});
