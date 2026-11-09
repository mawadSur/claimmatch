import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  getReminderPermission,
  getRemindersEnabled,
  hasKnownReminders,
  setRemindersEnabled,
  type ReminderPermission,
  type RemindersOutcome,
} from '@/lib/reminders';

import { dashboardQueryOptions } from './dashboard';
import { dataKeys } from './keys';

export interface ReminderSettingState {
  /** True when reminders are on and notifications may show (the switch's value). */
  enabled: boolean;
  permission: ReminderPermission;
}

async function readReminderSetting(): Promise<ReminderSettingState> {
  const [on, permission] = await Promise.all([getRemindersEnabled(), getReminderPermission()]);
  return { enabled: on && permission === 'granted', permission };
}

export interface ReminderSetting extends ReminderSettingState {
  /** False until the stored choice and the permission have been read. */
  ready: boolean;
  /** True while turning on (the permission prompt may be up) or off. */
  busy: boolean;
  /**
   * Turns reminders on (asking for the permission if it is undecided) or off.
   * Resolves with the outcome: 'granted', 'denied', 'unavailable' or 'off'.
   */
  setEnabled(on: boolean): Promise<RemindersOutcome>;
}

/**
 * The Settings "Deadline reminders" switch. Re-reads the permission when the
 * app returns to the foreground (it can change in the system Settings). After
 * turning on, schedules from the dashboard data, loading it if needed.
 */
export function useReminderSetting(): ReminderSetting {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: dataKeys.reminderSetting,
    queryFn: readReminderSetting,
    staleTime: Infinity,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.invalidateQueries({ queryKey: dataKeys.reminderSetting });
    });
    return () => subscription.remove();
  }, [client]);

  const mutation = useMutation<RemindersOutcome, Error, boolean>({
    mutationFn: (on) => setRemindersEnabled(on),
    onSuccess: async (outcome) => {
      // setRemindersEnabled already scheduled the reminders it knew about.
      if (outcome === 'granted' && !hasKnownReminders()) void client.prefetchQuery(dashboardQueryOptions());
      await client.invalidateQueries({ queryKey: dataKeys.reminderSetting });
    },
  });

  return {
    ready: query.isSuccess,
    enabled: query.data?.enabled ?? false,
    permission: query.data?.permission ?? 'undetermined',
    busy: mutation.isPending,
    setEnabled: mutation.mutateAsync,
  };
}
