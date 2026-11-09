import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createElement } from 'react';
import { Platform } from 'react-native';

import { createQueryClient } from '@/lib/query-client';
import {
  cancelAllReminders,
  MAX_SCHEDULED_REMINDERS,
  planReminders,
  REMINDER_CHANNEL_ID,
  reminderEpoch,
  reminderHrefFrom,
  REMINDERS_ENABLED_KEY,
  reminderText,
  setRemindersEnabled,
  syncReminders,
  useReminderTaps,
  type DeadlineReminder,
} from '@/lib/reminders';
import { AuthProvider, useAuth, type AuthContextValue } from '@/providers/AuthProvider';

type Permission = { granted: boolean; canAskAgain: boolean; status: string; ios?: { status: number } };

const mockNotifications: {
  permission: Permission;
  requested: Permission;
  scheduled: { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }[];
  lastResponse: unknown;
  listener: ((response: unknown) => void) | null;
  failPermissions: boolean;
} = {
  permission: { granted: false, canAskAgain: true, status: 'undetermined' },
  requested: { granted: true, canAskAgain: true, status: 'granted' },
  scheduled: [],
  lastResponse: null,
  listener: null,
  failPermissions: false,
};

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getPermissionsAsync: jest.fn(async () => {
    if (mockNotifications.failPermissions) throw new Error('no notifications here');
    return mockNotifications.permission;
  }),
  requestPermissionsAsync: jest.fn(async () => {
    mockNotifications.permission = mockNotifications.requested;
    return mockNotifications.requested;
  }),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async (request: { identifier: string }) => {
    mockNotifications.scheduled.push(request as never);
    return request.identifier;
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {
    mockNotifications.scheduled = [];
  }),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(() => mockNotifications.lastResponse),
  clearLastNotificationResponse: jest.fn(() => {
    mockNotifications.lastResponse = null;
  }),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockNotifications.listener = listener;
    return { remove: jest.fn() };
  }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

type AuthCallback = (event: string, session: Session | null) => void;
const mockAuth: { callback: AuthCallback | null } = { callback: null };
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        mockAuth.callback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  }),
  signOutOnThisDevice: async () => ({ error: null }),
}));

const GRANTED: Permission = { granted: true, canAskAgain: true, status: 'granted' };
const push = router.push as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancelScheduled = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const dismissDelivered = Notifications.dismissAllNotificationsAsync as jest.Mock;
const requestPermission = Notifications.requestPermissionsAsync as jest.Mock;

const acme: DeadlineReminder = {
  claimId: 'c1',
  slug: 'acme-data-breach',
  title: 'Acme Data Breach',
  deadline: '2026-11-20',
};

/** 8:00 local time on Nov 2, 2026 (reminders are in device time). */
const NOW = new Date(2026, 10, 2, 8, 0, 0, 0).getTime();

function localParts(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await cancelAllReminders();
  jest.clearAllMocks();
  mockNotifications.permission = { granted: false, canAskAgain: true, status: 'undetermined' };
  mockNotifications.requested = GRANTED;
  mockNotifications.scheduled = [];
  mockNotifications.lastResponse = null;
  mockNotifications.listener = null;
  mockNotifications.failPermissions = false;
});

describe('planReminders', () => {
  it('reminds at 9:00 local time 7 days and 1 day before the deadline, soonest first', () => {
    const planned = planReminders([acme], NOW);
    expect(planned.map((reminder) => reminder.identifier)).toEqual(['deadline-c1-7d', 'deadline-c1-1d']);
    expect(localParts(planned[0].at)).toEqual([2026, 11, 13, 9, 0]);
    expect(localParts(planned[1].at)).toEqual([2026, 11, 19, 9, 0]);
    expect(planned[0].href).toBe('/claim/acme-data-breach');
  });

  it('skips reminder times that have already passed', () => {
    // 7 days before Nov 5 was Oct 29; 1 day before is Nov 4 at 9:00.
    const soon = planReminders([{ ...acme, deadline: '2026-11-05' }], NOW);
    expect(soon.map((reminder) => localParts(reminder.at))).toEqual([[2026, 11, 4, 9, 0]]);

    // At 9:00 on Nov 2 itself, the 1-day reminder for Nov 3 is due now: skipped.
    const atNine = new Date(2026, 10, 2, 9, 0, 0, 0).getTime();
    expect(planReminders([{ ...acme, deadline: '2026-11-03' }], atNine)).toEqual([]);
    expect(planReminders([{ ...acme, deadline: 'not a date' }], NOW)).toEqual([]);
  });

  it('keeps the 64 soonest (the iOS limit)', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...acme,
      claimId: `c${i}`,
      deadline: `2027-01-${String(31 - (i % 28)).padStart(2, '0')}`,
    }));
    const planned = planReminders(many, NOW);
    expect(planned).toHaveLength(MAX_SCHEDULED_REMINDERS);
    const times = planned.map((reminder) => reminder.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('words the reminder exactly as plan 5 says, with the formatted deadline', () => {
    expect(reminderText('Acme Data Breach', '2026-11-20')).toBe(
      'Acme Data Breach. Deadline Nov 20, 2026. If you qualify, file on the official site, then tell us in ClaimMatch.',
    );
    expect(reminderText('Widgets Inc. ', '2026-11-20')).toBe(
      'Widgets Inc. Deadline Nov 20, 2026. If you qualify, file on the official site, then tell us in ClaimMatch.',
    );
  });
});

describe('syncReminders', () => {
  it('schedules nothing while reminders are off', async () => {
    mockNotifications.permission = GRANTED;
    await expect(syncReminders([acme], { nowMs: NOW })).resolves.toEqual({ status: 'off' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('cancels and reschedules when on and allowed, with the claim link as data', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = GRANTED;
    await expect(syncReminders([acme], { nowMs: NOW })).resolves.toEqual({ status: 'scheduled', count: 2 });

    expect(cancelScheduled.mock.invocationCallOrder[0]).toBeLessThan(schedule.mock.invocationCallOrder[0]);
    expect(mockNotifications.scheduled).toHaveLength(2);
    const [first] = mockNotifications.scheduled;
    expect(first.identifier).toBe('deadline-c1-7d');
    expect(first.content).toEqual({
      body: 'Acme Data Breach. Deadline Nov 20, 2026. If you qualify, file on the official site, then tell us in ClaimMatch.',
      data: { href: '/claim/acme-data-breach' },
      sound: 'default',
    });
    expect(first.trigger).toMatchObject({ type: 'date', channelId: REMINDER_CHANNEL_ID });
    expect(localParts(first.trigger.date as Date)).toEqual([2026, 11, 13, 9, 0]);
  });

  it('schedules nothing without the permission', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = { granted: false, canAskAgain: false, status: 'denied' };
    await expect(syncReminders([acme], { nowMs: NOW })).resolves.toEqual({ status: 'no_permission' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('accepts provisional delivery on iOS as allowed', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = { granted: false, canAskAgain: true, status: 'undetermined', ios: { status: 3 } };
    await expect(syncReminders([acme], { nowMs: NOW })).resolves.toMatchObject({ status: 'scheduled' });
  });

  it('ignores data requested before a sign-out', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = GRANTED;
    const requestedIn = reminderEpoch();
    await cancelAllReminders();
    await expect(syncReminders([acme], { epoch: requestedIn, nowMs: NOW })).resolves.toEqual({ status: 'stale' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('forgets the on/off choice on every sign-out and account deletion, so the next account starts off', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = GRANTED;
    await cancelAllReminders();
    expect(await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)).toBeNull();
    // The next account's first dashboard load schedules nothing it never asked for.
    await expect(syncReminders([acme], { nowMs: NOW })).resolves.toEqual({ status: 'off' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('lets a sign-out that lands mid-schedule cancel everything', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    mockNotifications.permission = GRANTED;
    const syncing = syncReminders([acme, { ...acme, claimId: 'c2', deadline: '2026-12-20' }], { nowMs: NOW });
    const signingOut = cancelAllReminders();
    await Promise.all([syncing, signingOut]);
    expect(mockNotifications.scheduled).toEqual([]);
    expect(dismissDelivered).toHaveBeenCalled();
  });
});

describe('setRemindersEnabled', () => {
  it('asks for the permission only when turning on, then schedules the known reminders', async () => {
    // Scheduling right away uses the real clock: a deadline a month from today.
    const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await syncReminders([{ ...acme, deadline: inAMonth }]); // reminders are off: remembered, not scheduled
    expect(schedule).not.toHaveBeenCalled();

    await expect(setRemindersEnabled(true)).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true } });
    expect(await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)).toBe('1');
    expect(schedule).toHaveBeenCalled();
  });

  it('does not ask again once refused for good, and stays off', async () => {
    mockNotifications.permission = { granted: false, canAskAgain: false, status: 'denied' };
    await expect(setRemindersEnabled(true)).resolves.toBe('denied');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)).toBe('0');
  });

  it('stays off when the prompt is refused', async () => {
    mockNotifications.requested = { granted: false, canAskAgain: false, status: 'denied' };
    await expect(setRemindersEnabled(true)).resolves.toBe('denied');
    expect(await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)).toBe('0');
  });

  it('reports unavailable when notifications cannot be used', async () => {
    mockNotifications.failPermissions = true;
    await expect(setRemindersEnabled(true)).resolves.toBe('unavailable');
  });

  it('turns off without asking and cancels what was scheduled', async () => {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, '1');
    await expect(setRemindersEnabled(false)).resolves.toBe('off');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(cancelScheduled).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)).toBe('0');
  });

  it('creates the Android channel before asking, so Android 13 can show the prompt', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await setRemindersEnabled(true);
    const channel = Notifications.setNotificationChannelAsync as jest.Mock;
    expect(channel).toHaveBeenCalledWith(REMINDER_CHANNEL_ID, expect.objectContaining({ name: 'Deadline reminders' }));
    expect(channel.mock.invocationCallOrder[0]).toBeLessThan(requestPermission.mock.invocationCallOrder[0]);
    jest.restoreAllMocks();
  });
});

describe('reminder taps', () => {
  function tap(href: unknown, identifier = 'deadline-c1-7d', actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return {
      actionIdentifier,
      notification: { date: 1_700_000_000, request: { identifier, content: { data: { href } } } },
    };
  }

  it('follows only "/claim/{slug}" hrefs', () => {
    expect(reminderHrefFrom({ href: '/claim/acme-data-breach' })).toBe('/claim/acme-data-breach');
    for (const href of ['https://evil.example/claim/x', '//evil.example', '/claim/../settings', '/claim/ACME', '/lawsuits/acme', 42]) {
      expect(reminderHrefFrom({ href })).toBeNull();
    }
    expect(reminderHrefFrom(null)).toBeNull();
    expect(reminderHrefFrom('href')).toBeNull();
  });

  it('opens the claim of the tap that launched the app, once, and shows reminders in the foreground', async () => {
    mockNotifications.lastResponse = tap('/claim/acme-data-breach');
    await renderHook(() => useReminderTaps());

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/claim/acme-data-breach');
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0]?.[0];
    await expect(handler?.handleNotification()).resolves.toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });

    // The same tap delivered again by the listener is not followed twice.
    mockNotifications.listener?.(tap('/claim/acme-data-breach'));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('opens taps while running, and ignores other hrefs and actions', async () => {
    await renderHook(() => useReminderTaps());
    expect(push).not.toHaveBeenCalled();

    mockNotifications.listener?.(tap('/claim/beta-settlement', 'deadline-c2-1d'));
    mockNotifications.listener?.(tap('https://evil.example', 'deadline-c3-1d'));
    mockNotifications.listener?.(tap('/claim/gamma', 'deadline-c4-1d', 'dismiss'));
    expect(push.mock.calls).toEqual([['/claim/beta-settlement']]);
  });
});

describe('sign-out', () => {
  it('cancels and clears every reminder on each sign-out path in AuthProvider', async () => {
    const client = createQueryClient();
    let auth: AuthContextValue | null = null;
    function Probe() {
      auth = useAuth();
      return null;
    }
    await render(createElement(QueryClientProvider, { client }, createElement(AuthProvider, null, createElement(Probe))));
    const session = { access_token: 'token-1', user: { id: 'user-1' } } as unknown as Session;
    await act(async () => {
      mockAuth.callback?.('INITIAL_SESSION', session);
    });
    expect(cancelScheduled).not.toHaveBeenCalled();

    // signOut() from the app.
    await act(async () => {
      await auth!.signOut();
    });
    await waitFor(() => expect(cancelScheduled).toHaveBeenCalledTimes(1));
    expect(dismissDelivered).toHaveBeenCalledTimes(1);

    // A SIGNED_OUT from auth-js (for example the API client signing out a dead session).
    await act(async () => {
      mockAuth.callback?.('SIGNED_IN', session);
      mockAuth.callback?.('SIGNED_OUT', null);
    });
    await waitFor(() => expect(cancelScheduled).toHaveBeenCalledTimes(2));

    // Another account signing in on this device.
    await act(async () => {
      mockAuth.callback?.('SIGNED_IN', session);
      mockAuth.callback?.('SIGNED_IN', { ...session, user: { id: 'user-2' } } as unknown as Session);
    });
    await waitFor(() => expect(cancelScheduled).toHaveBeenCalledTimes(3));
    client.clear();
  });
});
