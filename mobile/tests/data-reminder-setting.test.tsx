import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useReminderSetting } from '@/data/reminder-setting';
import { setRemindersEnabled } from '@/lib/reminders';

const mockReminders = { enabled: false, permission: 'undetermined', known: false };

jest.mock('@/lib/reminders', () => ({
  getRemindersEnabled: jest.fn(async () => mockReminders.enabled),
  getReminderPermission: jest.fn(async () => mockReminders.permission),
  hasKnownReminders: () => mockReminders.known,
  setRemindersEnabled: jest.fn(async (on: boolean) => {
    if (!on) {
      mockReminders.enabled = false;
      return 'off';
    }
    mockReminders.enabled = true;
    mockReminders.permission = 'granted';
    return 'granted';
  }),
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'scheduled', count: 0 })),
}));

const mockDashboard = jest.fn(async () => ({}));
jest.mock('@/data/dashboard', () => ({
  dashboardQueryOptions: () => ({ queryKey: ['dashboard'], queryFn: () => mockDashboard() }),
}));

function setup() {
  // Infinite gcTime: no garbage-collection timers outlive the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper };
}

beforeEach(() => {
  mockReminders.enabled = false;
  mockReminders.permission = 'undetermined';
  mockReminders.known = false;
  mockDashboard.mockClear();
  (setRemindersEnabled as jest.Mock).mockClear();
});

describe('useReminderSetting', () => {
  it('is off by default, and on only while notifications may show', async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const setting = useReminderSetting();
        return { ready: setting.ready, enabled: setting.enabled, permission: setting.permission };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toEqual({ ready: true, enabled: false, permission: 'undetermined' });
    client.clear();

    mockReminders.enabled = true;
    mockReminders.permission = 'denied';
    const withdrawn = setup();
    const second = await renderHook(
      () => {
        const setting = useReminderSetting();
        return { ready: setting.ready, enabled: setting.enabled, permission: setting.permission };
      },
      { wrapper: withdrawn.wrapper },
    );
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current).toMatchObject({ enabled: false, permission: 'denied' });
    withdrawn.client.clear();
  });

  it('turns on, then loads the dashboard to schedule when no reminders are known yet', async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const setting = useReminderSetting();
        return { enabled: setting.enabled, setEnabled: setting.setEnabled };
      },
      { wrapper },
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.setEnabled(true);
    });
    expect(outcome).toBe('granted');
    expect(setRemindersEnabled).toHaveBeenCalledWith(true);
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockDashboard).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('does not reload the dashboard when its reminders are already known', async () => {
    mockReminders.known = true;
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useReminderSetting().setEnabled, { wrapper });
    await act(async () => {
      await result.current(true);
    });
    expect(mockDashboard).not.toHaveBeenCalled();

    await act(async () => {
      await expect(result.current(false)).resolves.toBe('off');
    });
    client.clear();
  });
});
