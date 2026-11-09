import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useRefetchOnFocus } from '@/data/focus';

/** The screen's focus effect, driven by the test (expo-router calls it on focus, its cleanup on blur). */
const mockFocus: { effect: (() => void | (() => void)) | null } = { effect: null };

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus.effect = effect;
  },
}));

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  mockFocus.effect = null;
  appStateListener = null;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function focus(): () => void {
  const cleanup = mockFocus.effect?.();
  return typeof cleanup === 'function' ? cleanup : () => undefined;
}

describe('useRefetchOnFocus', () => {
  it('skips the first focus, then refetches on every return without restarting a running load', async () => {
    const refetch = jest.fn();
    await renderHook(() => useRefetchOnFocus(refetch));

    const blurFirst = focus();
    expect(refetch).not.toHaveBeenCalled();
    blurFirst();

    const blurSecond = focus();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    blurSecond();
  });

  it('refetches when the app returns to the foreground while the screen is focused, not while it is hidden', async () => {
    const refetch = jest.fn();
    await renderHook(() => useRefetchOnFocus(refetch));

    const blur = focus();
    appStateListener?.('background');
    appStateListener?.('active');
    expect(refetch).toHaveBeenCalledTimes(1);

    blur();
    appStateListener?.('active');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, and stops listening when unmounted', async () => {
    const refetch = jest.fn();
    const { unmount } = await renderHook(() => useRefetchOnFocus(refetch, { enabled: false }));
    focus()();
    focus();
    appStateListener?.('active');
    expect(refetch).not.toHaveBeenCalled();
    await unmount();

    const enabled = await renderHook(() => useRefetchOnFocus(refetch));
    await enabled.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
