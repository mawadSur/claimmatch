import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDeadline, todayInDeadlineZone } from '@shared/lib/utils';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  checkOnClaimSentence,
  claim as copy,
  closedSentence,
  copyFieldLabel,
  deadlinePassedSentence,
  forUpdatesSentence,
  listingSourceSentence,
  loadErrorTitle,
  recheckingSentence,
  reportedTitle,
  stepHeadingLabel,
  submittedNote,
  undoWarning,
  undoneMessage,
} from '@/copy/claim';
import { checkConfirmationNumber } from '@/features/claim/ConfirmationNumberField';
import { dayToDate, endOfDay, latestFilingDay, localISODate, startOfDay } from '@/features/claim/dates';
import { FiledOnField } from '@/features/claim/FiledOnField';
import { formatPacketBlock } from '@/features/claim/PrefillPacket';
import { useOfficialFormOpener } from '@/features/claim/use-official-form';
import { openExternalUrl } from '@/lib/external-link';

jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(),
}));
jest.mock('@/providers/ConfigProvider', () => ({ useConfig: () => ({ isFlagOn: () => false }) }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' } }) }));
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

describe('claim copy builders', () => {
  it('joins the web fragments into the web sentences', () => {
    expect(stepHeadingLabel(2, copy.step2Title.text)).toBe('Step 2: File on the official site');
    expect(loadErrorTitle('your claim', 'fallback')).toBe('We couldn’t load your claim');
    expect(loadErrorTitle(null, 'fallback')).toBe('fallback');
    expect(closedSentence('Jan 1, 2026')).toBe('Its deadline was Jan 1, 2026, so it is no longer taking claims.');
    expect(closedSentence(null)).toBe('It is no longer taking claims.');
    expect(deadlinePassedSentence('Oct 20, 2026', true, 'Nov 19, 2026')).toBe(
      'The deadline for this settlement was Oct 20, 2026. Did you file before then? Tell us by Nov 19, 2026.',
    );
    expect(deadlinePassedSentence('Oct 20, 2026', true, null)).toBe(
      'The deadline for this settlement was Oct 20, 2026. Did you file before then? Tell us below.',
    );
    expect(deadlinePassedSentence('Oct 20, 2026', false, 'Nov 19, 2026')).toBe(
      'The deadline for this settlement was Oct 20, 2026.',
    );
    expect(recheckingSentence(false)).toBe(
      'We’re re-checking it. Check the official site to see if it still takes claims: use the link in the notice you got by mail or email. Already filed? Tell us here, and we’ll keep your claim and confirmation number in one place.',
    );
    expect(forUpdatesSentence()).toBe('For updates, check the official site.');
    expect(checkOnClaimSentence()).toBe('To check on your claim or update your details, use the official site.');
    expect(listingSourceSentence(null)).toBe(
      'Our listing came from this source, which is not the official site. Look there for the official link.',
    );
    expect(reportedTitle('Oct 30, 2026')).toBe('Reported filed by you on Oct 30, 2026');
    expect(reportedTitle(null)).toBe('Reported filed by you');
    expect(undoWarning('Nov 19, 2026')).toBe(
      "Your claim will show as not filed. After Nov 19, 2026 you won't be able to tell us you filed.",
    );
    expect(undoWarning(null)).toBe('Your claim will show as not filed until you tell us again.');
    expect(undoneMessage('Not filed yet', null)).toBe('Undone. Your claim shows as Not filed yet.');
    expect(undoneMessage('Not reported filed', 'Nov 19, 2026')).toBe(
      'Undone. Your claim shows as Not reported filed. You can tell us you filed until Nov 19, 2026.',
    );
    expect(submittedNote('Oct 30, 2026')).toBe(`${copy.keepNumber.text} You filed on Oct 30, 2026.`);
    expect(copyFieldLabel('Full name')).toBe('Copy Full name');
  });
});

describe('checkConfirmationNumber', () => {
  it('allows an empty optional number and requires one when asked', () => {
    expect(checkConfirmationNumber('   ', false)).toEqual({ ok: true, value: undefined });
    expect(checkConfirmationNumber('', true)).toEqual({ ok: false, error: copy.enterNumber.text });
  });

  it('normalizes spaces and applies the server rules', () => {
    expect(checkConfirmationNumber('  ab   12-3/4.5#  ', true)).toEqual({ ok: true, value: 'ab 12-3/4.5#' });
    expect(checkConfirmationNumber('x'.repeat(65), false)).toEqual({
      ok: false,
      error: 'That confirmation number is too long. Use 64 characters or fewer.',
    });
  });
});

describe('filing dates', () => {
  it('reads device-local days', () => {
    expect(localISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayToDate('2026-10-30', new Date(0))).toEqual(new Date(2026, 9, 30, 12));
    expect(dayToDate('not a day', new Date(0))).toEqual(new Date(0));
    expect(startOfDay('2000-01-01')).toEqual(new Date(2000, 0, 1, 0, 0, 0, 0));
    expect(endOfDay('2026-11-02')).toEqual(new Date(2026, 10, 2, 23, 59, 59, 999));
  });

  it('offers today in the deadline zone, or the device’s later today', () => {
    for (const iso of ['2026-10-16T02:00:00Z', '2026-10-16T04:00:00Z', '2026-11-02T15:00:00Z', '2026-12-31T23:30:00Z']) {
      const at = new Date(iso);
      const latest = latestFilingDay(at);
      expect([todayInDeadlineZone(at), localISODate(at)]).toContain(latest);
      expect(latest >= todayInDeadlineZone(at) && latest >= localISODate(at)).toBe(true);
    }
  });
});

describe('formatPacketBlock', () => {
  it('lists the details as the web copies them', () => {
    const fields = {
      full_name: 'Ana Diaz',
      email: 'ana@example.com',
      phone: '555-0100',
      address_line1: '1 Main St',
      address_line2: 'Apt 2',
      city: '',
      state: 'CA',
    };
    expect(formatPacketBlock(fields)).toBe('Full name: Ana Diaz\nEmail: ana@example.com\nPhone: 555-0100\n1 Main St\nApt 2\nCA');
  });
});

describe('useOfficialFormOpener', () => {
  let onChange: ((state: AppStateStatus) => void) | null = null;
  // React Native's Jest mock makes currentState a function; the app reads the status string.
  const state = AppState as unknown as { currentState: unknown };
  const mockCurrentState = state.currentState;

  beforeEach(() => {
    onChange = null;
    (AppState.addEventListener as jest.Mock).mockImplementation((_type: string, listener: (next: AppStateStatus) => void) => {
      onChange = listener;
      return { remove: jest.fn() };
    });
    state.currentState = 'active';
    (openExternalUrl as jest.Mock).mockReset();
  });

  afterEach(() => {
    state.currentState = mockCurrentState;
  });

  it('calls back when the iOS browser closes', async () => {
    (openExternalUrl as jest.Mock).mockResolvedValue({ type: 'cancel' });
    const onBack = jest.fn();
    const { result } = await renderHook(() => useOfficialFormOpener(onBack));
    await act(() => result.current('https://www.acmesettlement.com/claim'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.acmesettlement.com/claim');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('waits for the app to come back on Android, where the promise settles on opening', async () => {
    (openExternalUrl as jest.Mock).mockResolvedValue({ type: 'opened' });
    const onBack = jest.fn();
    const { result } = await renderHook(() => useOfficialFormOpener(onBack));
    await act(() => result.current('https://www.acmesettlement.com/claim'));
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => onChange?.('background'));
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => onChange?.('active'));
    expect(onBack).toHaveBeenCalledTimes(1);
    // A later trip to the background is not a return from the official site.
    await act(async () => onChange?.('background'));
    await act(async () => onChange?.('active'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no browser opened', async () => {
    (openExternalUrl as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ type: 'locked' });
    const onBack = jest.fn();
    const { result } = await renderHook(() => useOfficialFormOpener(onBack));
    await act(() => result.current('https://www.acmesettlement.com/claim'));
    await act(() => result.current('https://www.acmesettlement.com/claim'));
    await act(async () => onChange?.('background'));
    await act(async () => onChange?.('active'));
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('FiledOnField on Android', () => {
  function Field() {
    const [value, setValue] = useState('');
    return <FiledOnField value={value} onChange={setValue} />;
  }

  it('opens the system dialog limited to 2000-01-01 through today, and keeps the picked day', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const user = userEvent.setup();
      await render(<Field />);
      await user.press(screen.getByTestId('claim-filed-on'));
      const open = DateTimePickerAndroid.open as jest.Mock;
      expect(open).toHaveBeenCalledTimes(1);
      const params = open.mock.calls[0][0];
      expect(params).toMatchObject({ mode: 'date', minimumDate: startOfDay('2000-01-01') });
      expect(params.maximumDate.getTime()).toBeGreaterThanOrEqual(endOfDay(localISODate(new Date())).getTime() - 1);
      await act(async () => params.onValueChange({ nativeEvent: { timestamp: 0, utcOffset: 0 } }, new Date(2026, 9, 30, 9)));
      expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({ text: 'Oct 30, 2026' });
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('FiledOnField on iOS', () => {
  function Field() {
    const [value, setValue] = useState('');
    return <FiledOnField value={value} onChange={setValue} />;
  }

  it('keeps the day the inline calendar shows when Done is pressed, since tapping that same day sends nothing', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      const user = userEvent.setup();
      await render(<Field />);
      await user.press(screen.getByTestId('claim-filed-on'));
      expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({ text: copy.chooseDate.text });
      await user.press(screen.getByRole('button', { name: copy.doneChoosingDate.text }));
      expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({
        text: formatDeadline(localISODate(new Date())),
      });
      expect(screen.queryByRole('button', { name: copy.doneChoosingDate.text })).toBeNull();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('closes without a date when the field is tapped again', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      const user = userEvent.setup();
      await render(<Field />);
      await user.press(screen.getByTestId('claim-filed-on'));
      expect(screen.getByRole('button', { name: copy.doneChoosingDate.text })).toBeOnTheScreen();
      await user.press(screen.getByTestId('claim-filed-on'));
      expect(screen.queryByRole('button', { name: copy.doneChoosingDate.text })).toBeNull();
      expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({ text: copy.chooseDate.text });
    } finally {
      jest.restoreAllMocks();
    }
  });
});
