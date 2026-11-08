import { act, render, screen, userEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Dimensions, Keyboard, type KeyboardEvent } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  BUTTON_PADDING_X,
  CheckboxRow,
  Chip,
  ExternalLinkButton,
  IconButton,
  ListItem,
  Notice,
  Screen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { X } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { overlapWithKeyboard } from '@/hooks/use-keyboard-overlap';
import { openExternalUrl } from '@/lib/external-link';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));

jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

const impactAsync = Haptics.impactAsync as jest.Mock;
const openUrl = openExternalUrl as jest.Mock;

beforeEach(() => {
  impactAsync.mockClear();
  openUrl.mockClear();
});

describe('Button', () => {
  it('is an accessible button with a 44 pt target that taps with a light haptic', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Start your claim" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Start your claim' });
    expect(button).toBeEnabled();
    expect(button).not.toBeBusy();
    expect(button).toHaveStyle({ minHeight: 48 });

    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith('light');
  });

  it('announces disabled and ignores presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Save" variant="secondary" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: 0.5 });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces busy while loading and keeps its label for screen readers', async () => {
    await render(<Button label="Saving" loading onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it('lets a ghost button bleed by its side padding, keeping its 48 pt target', async () => {
    await render(
      <>
        <Button label="Show all" variant="ghost" bleed="start" onPress={() => undefined} />
        <Button label="Edit profile" variant="ghost" bleed="end" onPress={() => undefined} />
        <Button label="Cancel" variant="ghost" onPress={() => undefined} />
      </>,
    );
    const start = screen.getByRole('button', { name: 'Show all' });
    expect(start).toHaveStyle({ marginStart: -BUTTON_PADDING_X, paddingHorizontal: BUTTON_PADDING_X, minHeight: 48 });
    const end = screen.getByRole('button', { name: 'Edit profile' });
    expect(end).toHaveStyle({ marginEnd: -BUTTON_PADDING_X, paddingHorizontal: BUTTON_PADDING_X, minHeight: 48 });
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveStyle({ marginStart: -BUTTON_PADDING_X });
  });

  it('adds no haptic to non-primary buttons', async () => {
    const user = userEvent.setup();
    await render(<Button label="Details" variant="ghost" onPress={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Details' }));
    expect(impactAsync).not.toHaveBeenCalled();
  });
});

describe('ExternalLinkButton', () => {
  it('opens the website in the in-app browser without an onBrowserResult callback', async () => {
    const user = userEvent.setup();
    await render(<ExternalLinkButton url="https://www.example-settlement.com/claim" label="Official site" />);
    const link = screen.getByRole('link', { name: 'Official site' });
    expect(link.props.accessibilityHint).toBe(common.opensInBrowserHint.text);
    await user.press(link);
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith('https://www.example-settlement.com/claim');
  });

  it('passes the browser result to onBrowserResult after opening', async () => {
    const user = userEvent.setup();
    const onBrowserResult = jest.fn();
    await render(<ExternalLinkButton url="https://www.example-settlement.com/" label="Official site" onBrowserResult={onBrowserResult} />);
    await user.press(screen.getByRole('link', { name: 'Official site' }));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(onBrowserResult).toHaveBeenCalledWith({ type: 'opened' });
  });

  it('is disabled for a URL that is not a website', async () => {
    const user = userEvent.setup();
    await render(<ExternalLinkButton url="javascript:alert(1)" label="Official site" />);
    const link = screen.getByRole('link', { name: 'Official site' });
    expect(link).toBeDisabled();
    await user.press(link);
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('accessibility of other controls', () => {
  it('requires a label on icon-only buttons', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon={X} accessibilityLabel={common.close.text} onPress={onPress} />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveStyle({ width: 44, height: 44 });
  });

  it('exposes filter chips as toggle buttons with their checked state', async () => {
    await render(
      <>
        <Chip label="Has a deadline" selected onPress={jest.fn()} />
        <Chip label="No proof required" onPress={jest.fn()} />
      </>,
    );
    // toBeChecked() covers checkbox, radio and switch only, so read the state the screen reader gets.
    expect(screen.getByRole('togglebutton', { name: 'Has a deadline' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole('togglebutton', { name: 'No proof required' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
  });

  it('announces error notices when they appear and reads a notice as one element', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await render(<Notice tone="error" title="Settlements didn’t load." body={common.networkError.text} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(`Settlements didn’t load.${common.networkError.text}`);
    // iOS: an announcement queued behind current speech. Android: a live region.
    expect(announce).toHaveBeenCalledWith(`Settlements didn’t load.. ${common.networkError.text}`, { queue: true });
    expect(alert).toHaveProp('accessibilityLiveRegion', 'assertive');
    announce.mockRestore();
  });

  it('announces success notices politely and keeps static notices quiet', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const { rerender } = await render(<Notice tone="success" body="Saved" testID="notice" />);
    expect(announce).toHaveBeenCalledWith('Saved', { queue: true });
    expect(screen.getByTestId('notice')).toHaveProp('accessibilityLiveRegion', 'polite');

    await rerender(<Notice tone="success" body="Saved again" testID="notice" />);
    expect(announce).toHaveBeenLastCalledWith('Saved again', { queue: true });

    announce.mockClear();
    await rerender(<Notice tone="unverified" body={common.unverifiedNoticeBody.text} testID="notice" />);
    await rerender(<Notice tone="error" body="Quiet" announce={false} testID="notice" />);
    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice')).toHaveProp('accessibilityLiveRegion', 'none');
    announce.mockRestore();
  });

  it('marks headline text as a header and caps Dynamic Type growth', async () => {
    await render(<AppText variant="display">Open settlements</AppText>);
    const heading = screen.getByRole('header', { name: 'Open settlements' });
    expect(heading).toHaveProp('allowFontScaling', true);
    expect(heading).toHaveProp('maxFontSizeMultiplier', 1.5);
  });
});

describe('ListItem', () => {
  function withFontScale(fontScale: number) {
    return jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812, scale: 3, fontScale });
  }

  it('is one switch for screen readers when used as a toggle, and a tap anywhere toggles it', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    await render(
      <ListItem title="Deadline reminders" subtitle="A reminder before each deadline" toggle={{ value: false, onValueChange }} />,
    );

    const toggle = screen.getByRole('switch', { name: 'Deadline reminders, A reminder before each deadline' });
    expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    // The visual Switch is hidden from screen readers, so the row is the only switch.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    await user.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('keeps the title at least 45% wide beside a value, so it wraps by word instead of collapsing', async () => {
    const dimensions = withFontScale(1);
    await render(<ListItem title="Email" value="jordan.example@gmail.com" testID="row" />);
    expect(screen.getByTestId('row-value')).toHaveStyle({ maxWidth: '50%', textAlign: 'right' });
    expect(screen.getByTestId('row-text')).toHaveStyle({ flexGrow: 1, flexShrink: 1, minWidth: '45%' });
    expect(screen.getByTestId('row-text')).not.toContainElement(screen.getByTestId('row-value'));
    dimensions.mockRestore();
  });

  it('moves the value under the title at large text sizes', async () => {
    const dimensions = withFontScale(1.5);
    await render(<ListItem title="Email address" value="jordan.example@gmail.com" testID="row" />);
    expect(screen.getByTestId('row-value')).not.toHaveStyle({ maxWidth: '50%' });
    expect(screen.getByTestId('row-text')).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId('row-text')).toContainElement(screen.getByTestId('row-value'));
    dimensions.mockRestore();
  });
});

describe('form controls', () => {
  function withFontScale(fontScale: number) {
    return jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812, scale: 3, fontScale });
  }

  it('names a text field by its label and suffix, and reads and announces its error', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const { rerender } = await render(<TextField label="Confirmation number" labelSuffix="(optional)" value="" testID="field" />);
    const input = screen.getByLabelText('Confirmation number (optional)');
    expect(input).toHaveStyle({ fontSize: 16 });
    expect(screen.queryByRole('alert')).toBeNull();

    await rerender(
      <TextField label="Confirmation number" labelSuffix="(optional)" value="" error="Check the number." testID="field" />,
    );
    expect(screen.getByLabelText('Confirmation number (optional)').props.accessibilityHint).toBe('Check the number.');
    expect(screen.getByRole('alert')).toHaveTextContent('Check the number.');
    expect(announce).toHaveBeenCalledWith('Check the number.', { queue: true });
    announce.mockRestore();
  });

  it('keeps a trailing control beside the input, and moves it under the input at large text sizes', async () => {
    const trailing = <Button label="Copy" variant="secondary" onPress={() => undefined} />;
    const regular = withFontScale(1);
    const { unmount } = await render(<TextField label="City" value="Austin" trailing={trailing} testID="city" />);
    expect(screen.getByTestId('city-row')).toContainElement(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByTestId('city-row')).toHaveStyle({ flexDirection: 'row' });
    regular.mockRestore();
    await unmount();

    const large = withFontScale(1.5);
    await render(<TextField label="City" value="Austin" trailing={trailing} testID="city" />);
    expect(screen.getByTestId('city-row')).not.toHaveStyle({ flexDirection: 'row' });
    expect(screen.getByTestId('city-row')).toContainElement(screen.getByRole('button', { name: 'Copy' }));
    large.mockRestore();
  });

  it('shows and hides a password with a labeled button', async () => {
    const user = userEvent.setup();
    await render(<TextField label="Password" secure value="secret-pass" testID="password" />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await user.press(screen.getByRole('button', { name: common.showPassword.text }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByRole('button', { name: common.hidePassword.text })).toBeOnTheScreen();
  });

  it('makes a checkbox row one checkbox that toggles on a tap anywhere, in both appearances', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = await render(<CheckboxRow label="Save this address" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Save this address' });
    expect(box).not.toBeChecked();
    expect(box).toHaveStyle({ minHeight: 48 });
    await user.press(box);
    expect(onChange).toHaveBeenCalledWith(true);

    await rerender(<CheckboxRow appearance="plain" label="Save this address" checked onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: 'Save this address' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Save this address' })).toHaveStyle({ minHeight: 44 });
  });
});

describe('SectionHeader', () => {
  function withFontScale(fontScale: number) {
    return jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
  }
  const editProfile = <Button label="Edit profile" variant="ghost" onPress={() => undefined} />;

  it('centers an action on the title beside it, without making the row taller than the title', async () => {
    const dimensions = withFontScale(1);
    await render(<SectionHeader title="Your matches" description="Settlements that may apply to you." action={editProfile} testID="matches" />);
    const row = screen.getByTestId('matches-title-row');
    expect(row).toHaveStyle({ flexDirection: 'row', alignItems: 'center' });
    expect(row).toContainElement(screen.getByRole('button', { name: 'Edit profile' }));
    // A 48 pt button beside a 24 pt line: 12 pt above and below sit outside the row.
    expect(screen.getByTestId('matches-action-beside')).toHaveStyle({ marginVertical: -12 });
    expect(screen.queryByTestId('matches-action-below')).toBeNull();
    dimensions.mockRestore();
  });

  it('puts a wide outlined action under the description at every size', async () => {
    const dimensions = withFontScale(1);
    const browse = <Button label="Browse all settlements" variant="secondary" onPress={() => undefined} />;
    await render(
      <SectionHeader title="Closing soon" description="Open settlements in our list." action={browse} actionPlacement="below" testID="closing" />,
    );
    expect(screen.getByTestId('closing-title-row')).not.toContainElement(screen.getByRole('button', { name: 'Browse all settlements' }));
    expect(screen.getByTestId('closing-action-below')).toContainElement(screen.getByRole('button', { name: 'Browse all settlements' }));
    dimensions.mockRestore();
  });

  it('moves the action under the description at large text sizes', async () => {
    const dimensions = withFontScale(2.643);
    await render(<SectionHeader title="Your matches" description="Settlements that may apply to you." action={editProfile} testID="matches" />);
    expect(screen.getByTestId('matches-title-row')).not.toContainElement(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByTestId('matches-action-below')).toContainElement(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByRole('header', { name: 'Your matches' })).toBeOnTheScreen();
    dimensions.mockRestore();
  });

  it('lines a ghost action up with the title end beside it, and with the description start below it', async () => {
    const regular = withFontScale(1);
    await render(
      <SectionHeader title="Your matches" description="Settlements that may apply to you." action={editProfile} actionBleed testID="matches" />,
    );
    expect(screen.getByTestId('matches-action-beside')).toHaveStyle({ marginEnd: -BUTTON_PADDING_X, marginVertical: -12 });
    regular.mockRestore();
    await screen.unmount();

    const large = withFontScale(2.643);
    await render(
      <SectionHeader title="Your matches" description="Settlements that may apply to you." action={editProfile} actionBleed testID="matches" />,
    );
    expect(screen.getByTestId('matches-action-below')).toHaveStyle({ marginStart: -BUTTON_PADDING_X });
    large.mockRestore();
  });

  it('keeps an outlined action in line with the text', async () => {
    const dimensions = withFontScale(1);
    const browse = <Button label="Browse all settlements" variant="secondary" onPress={() => undefined} />;
    await render(
      <SectionHeader title="Closing soon" description="Open settlements in our list." action={browse} actionPlacement="below" testID="closing" />,
    );
    expect(screen.getByTestId('closing-action-below')).not.toHaveStyle({ marginStart: -BUTTON_PADDING_X });
    dimensions.mockRestore();
  });
});

describe('Screen footer', () => {
  const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

  it('drops the home-indicator inset under the footer while the keyboard is open', async () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
      listeners.set(name, listener as (event: KeyboardEvent) => void);
      return { remove: () => listeners.delete(name) } as ReturnType<typeof Keyboard.addListener>;
    });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen footer={<Button label="Delete" onPress={jest.fn()} />} testID="screen">
          <AppText>Type DELETE to confirm.</AppText>
        </Screen>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('screen-footer')).toHaveStyle({ paddingBottom: 12 + 34 });

    const event = { duration: 250, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 476, width: 375, height: 336 } };
    await act(async () => listeners.get('keyboardWillShow')?.(event as unknown as KeyboardEvent));
    expect(screen.getByTestId('screen-footer')).toHaveStyle({ paddingBottom: 12 });

    await act(async () => listeners.get('keyboardWillHide')?.(event as unknown as KeyboardEvent));
    expect(screen.getByTestId('screen-footer')).toHaveStyle({ paddingBottom: 12 + 34 });
    jest.restoreAllMocks();
  });

  it('measures how far the keyboard covers the screen in window coordinates', () => {
    // A sheet modal starting 54 pt down, 758 pt tall, over a keyboard whose top edge is at 476.
    expect(overlapWithKeyboard({ y: 54, height: 758 }, 476)).toBe(336);
    expect(overlapWithKeyboard({ y: 0, height: 400 }, 476)).toBe(0);
  });
});
