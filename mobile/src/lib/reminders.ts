import { parseCalendarDate } from '@shared/lib/claim-deadlines';
import { formatDeadline } from '@shared/lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
// Named: eslint-plugin-import cannot see these enums through the namespace's re-exports.
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { fillCopy, shared } from '@/copy/shared';
import { claimHref, claimRoute, isClaimHref, type ClaimHref } from '@/features/shared/hrefs';

/**
 * Deadline reminders (plan 5): local notifications at 9:00 local time, 7 days
 * and 1 day before the deadline of each claim still to file (the dashboard's
 * `reminders`). Rescheduled after every dashboard fetch and cleared on every
 * sign-out and on account deletion. Off until the user turns them on, and the
 * notification permission is asked only then. Nothing leaves the device.
 *
 * Every change to the scheduled set runs in one queue, so a sign-out that
 * lands while reminders are being scheduled always wins.
 */

/**
 * The on/off choice. It belongs to the account that made it: every sign-out
 * and account deletion removes it (cancelAllReminders), so the next account
 * on this device starts with reminders off.
 */
export const REMINDERS_ENABLED_KEY = 'claimmatch-deadline-reminders';
/** Android notification channel for the reminders. */
export const REMINDER_CHANNEL_ID = 'deadline-reminders';
export const REMINDER_HOUR = 9;
export const REMINDER_DAYS_BEFORE = [7, 1] as const;
/** iOS keeps only the 64 soonest local notifications of an app. */
export const MAX_SCHEDULED_REMINDERS = 64;

/** One entry of DashboardResponse['reminders']: a claim still to file with a deadline that has not passed. */
export interface DeadlineReminder {
  claimId: string;
  slug: string;
  title: string;
  /** YYYY-MM-DD. */
  deadline: string;
}

export interface PlannedReminder {
  /** Stable per claim and lead time, so scheduling again replaces it. */
  identifier: string;
  at: Date;
  body: string;
  href: ClaimHref;
}

/** "{title}. Deadline {date}. If you qualify, file on the official site, then tell us in ClaimMatch." */
export function reminderText(title: string, deadline: string): string {
  // A title ending in "Inc." must not give "Inc.. Deadline".
  const name = title.trim().replace(/[\s.]+$/, '');
  return fillCopy(shared.reminderBody.text, { title: name, date: formatDeadline(deadline) });
}

/**
 * What to schedule: 9:00 device time, 7 days and 1 day before each deadline
 * day, never a time already past. Soonest first, at most 64.
 */
export function planReminders(reminders: readonly DeadlineReminder[], nowMs: number): PlannedReminder[] {
  const planned = new Map<string, PlannedReminder>();
  for (const reminder of reminders) {
    const day = parseCalendarDate(reminder.deadline);
    if (!day) continue;
    const body = reminderText(reminder.title, reminder.deadline);
    const href = claimHref(reminder.slug);
    for (const daysBefore of REMINDER_DAYS_BEFORE) {
      // Local wall-clock time, so 9:00 stays 9:00 across a daylight-saving change.
      const at = new Date(day.y, day.m - 1, day.d - daysBefore, REMINDER_HOUR, 0, 0, 0);
      if (at.getTime() <= nowMs) continue;
      const identifier = `deadline-${reminder.claimId}-${daysBefore}d`;
      planned.set(identifier, { identifier, at, body, href });
    }
  }
  return [...planned.values()].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED_REMINDERS);
}

export type ReminderPermission =
  /** Notifications can show (on iOS also provisional delivery). */
  | 'granted'
  /** Refused, and the app may not ask again: only the system Settings can change it. */
  | 'denied'
  /** Not decided yet, or refused once on Android: asking shows the system prompt. */
  | 'undetermined'
  /** Notifications are not available here. */
  | 'unavailable';

function permissionOf(status: Notifications.NotificationPermissionsStatus): ReminderPermission {
  const iosStatus = status.ios?.status;
  if (
    status.granted ||
    iosStatus === IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** The notification permission, without asking. */
export async function getReminderPermission(): Promise<ReminderPermission> {
  try {
    return permissionOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/** Whether the user turned deadline reminders on (default off). */
export async function getRemindersEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

let channelReady: Promise<unknown> | null = null;

/** Android shows nothing without a channel, and Android 13 asks for the permission only once one exists. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  channelReady ??= Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: shared.reminderChannelName.text,
    importance: AndroidImportance.DEFAULT,
  }).catch((error: unknown) => {
    channelReady = null;
    throw error;
  });
  await channelReady;
}

/** Bumped by every sign-out: answers requested before it must not schedule anything. */
let epoch = 0;
/** The last reminders synced for the signed-in user (memory only), to schedule at once when turned on. */
let latest: readonly DeadlineReminder[] | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function cancelScheduledNow(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing is scheduled where notifications are unavailable.
  }
}

/** Changes on every sign-out. Read it before requesting the data you pass to syncReminders. */
export function reminderEpoch(): number {
  return epoch;
}

export type ReminderSyncResult =
  | { status: 'scheduled'; count: number }
  /** Reminders are turned off; anything scheduled was cancelled. */
  | { status: 'off' }
  /** The permission was withdrawn; anything scheduled was cancelled. */
  | { status: 'no_permission' }
  /** Signed out (or another account signed in) since the data was requested. */
  | { status: 'stale' }
  | { status: 'failed' };

/**
 * Cancels the scheduled reminders and schedules these instead, when the user
 * turned reminders on and the permission is granted. `epoch` is
 * reminderEpoch() from before the data was requested. Never rejects.
 */
export function syncReminders(
  reminders: readonly DeadlineReminder[],
  options: { epoch?: number; nowMs?: number } = {},
): Promise<ReminderSyncResult> {
  const requestedIn = options.epoch ?? epoch;
  return serial(async (): Promise<ReminderSyncResult> => {
    if (requestedIn !== epoch) return { status: 'stale' };
    latest = reminders;
    try {
      if (!(await getRemindersEnabled())) {
        await cancelScheduledNow();
        return { status: 'off' };
      }
      if ((await getReminderPermission()) !== 'granted') {
        await cancelScheduledNow();
        return { status: 'no_permission' };
      }
      await ensureChannel();
      await Notifications.cancelAllScheduledNotificationsAsync();
      let count = 0;
      for (const reminder of planReminders(reminders, options.nowMs ?? Date.now())) {
        // A sign-out queued behind this run cancels what was scheduled so far.
        if (requestedIn !== epoch) return { status: 'stale' };
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.identifier,
          content: { body: reminder.body, data: { href: reminder.href }, sound: 'default' },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.at,
            channelId: REMINDER_CHANNEL_ID,
          },
        });
        count += 1;
      }
      return { status: 'scheduled', count };
    } catch {
      return { status: 'failed' };
    }
  });
}

/**
 * Cancels every scheduled reminder, clears delivered ones from the
 * notification list, and forgets this user's reminders and their on/off
 * choice: for every sign-out and account deletion. Never rejects.
 */
export function cancelAllReminders(): Promise<void> {
  epoch += 1;
  latest = null;
  return serial(async () => {
    try {
      await AsyncStorage.removeItem(REMINDERS_ENABLED_KEY);
    } catch {
      // Unreadable storage reads as off (getRemindersEnabled).
    }
    await cancelScheduledNow();
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {
      // Nothing was delivered where notifications are unavailable.
    }
  });
}

export type RemindersOutcome =
  /** On, and notifications may show. */
  | 'granted'
  /** Still off: the permission was refused (now or before). */
  | 'denied'
  /** Still off: notifications are not available here. */
  | 'unavailable'
  /** Turned off; scheduled reminders were cancelled. */
  | 'off';

/**
 * Turns deadline reminders on or off. Turning on asks for the notification
 * permission only when it is still undecided, and is saved only when
 * notifications may show; the reminders already known are then scheduled.
 */
export async function setRemindersEnabled(on: boolean): Promise<RemindersOutcome> {
  try {
    if (!on) {
      await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '0');
      await serial(cancelScheduledNow);
      return 'off';
    }
    await ensureChannel();
    let permission = permissionOf(await Notifications.getPermissionsAsync());
    if (permission === 'undetermined') {
      // Alerts and sound only: the app never sets a badge.
      permission = permissionOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } }));
    }
    if (permission !== 'granted') {
      await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '0');
      return 'denied';
    }
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
  } catch {
    return 'unavailable';
  }
  if (latest) await syncReminders(latest);
  return 'granted';
}

/** True when there are reminders to schedule as soon as they are turned on. */
export function hasKnownReminders(): boolean {
  return latest !== null;
}

/** The claim a reminder opens, from its notification data; null unless it is "/claim/{slug}". */
export function reminderHrefFrom(data: unknown): ClaimHref | null {
  if (!data || typeof data !== 'object') return null;
  const href = (data as { href?: unknown }).href;
  return isClaimHref(href) ? href : null;
}

let foregroundHandlerSet = false;

/** A reminder that fires while the app is open shows as a quiet banner. */
function showRemindersInForeground(): void {
  if (foregroundHandlerSet) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    foregroundHandlerSet = true;
  } catch {
    // Without a handler, reminders still show while the app is in the background.
  }
}

/**
 * Opens the claim of a tapped reminder, also when the tap launched the app.
 * Only "/claim/{slug}" is followed. Mount once, in the root layout, where the
 * navigator already exists.
 */
export function useReminderTaps(): void {
  useEffect(() => {
    showRemindersInForeground();
    const opened = new Set<string>();

    function open(response: Notifications.NotificationResponse | null) {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const { notification } = response;
      // The launch tap can arrive both ways: follow it once.
      const key = `${notification.request.identifier}@${notification.date}`;
      if (opened.has(key)) return;
      opened.add(key);
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Only matters for a later remount.
      }
      const href = reminderHrefFrom(notification.request.content.data);
      if (href) router.push(claimRoute(href));
    }

    let launchTap: Notifications.NotificationResponse | null = null;
    try {
      launchTap = Notifications.getLastNotificationResponse();
    } catch {
      launchTap = null;
    }
    open(launchTap);

    let subscription: { remove(): void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(open);
    } catch {
      subscription = null;
    }
    return () => subscription?.remove();
  }, []);
}
