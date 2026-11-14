import {
  closedOutMessage,
  fictionalNoticeText,
  fictionalRowText,
  gotItForAllLabel,
  noticeListBody,
  noticeListTitle,
  notices,
  showAllNoticesLabel,
} from '@/copy/notices';
import { fillCopy, shared } from '@/copy/shared';
import { ConfigProvider, useConfig } from '@/providers/ConfigProvider';
import { APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER } from '@shared/lib/disclaimer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

// The config request fails, as offline: the app falls back to its bundled legal text.
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({ request: () => Promise.reject(new Error('offline')) }),
}));

/** The web components' sentences, assembled as they render (src/components/claims/CorrectiveNotice*.tsx). */
describe('corrective notice copy', () => {
  it('titles the dashboard notice by how many claims the old flow called filed', () => {
    expect(noticeListTitle(0)).toBe('A settlement in your list was not real');
    expect(noticeListTitle(1)).toBe('Lawsuit AI did not file your claim');
    expect(noticeListTitle(4)).toBe('Lawsuit AI did not file your claims');
  });

  it('explains the wrong "Claim filed" message for one or many claims', () => {
    expect(noticeListBody(0)).toBeNull();
    expect(noticeListBody(1)).toBe(
      'Earlier, Lawsuit AI showed “Claim filed” for the settlement below. That was wrong. We never sent anything to a settlement administrator, and we never file claims for anyone. Tell us where things stand.',
    );
    expect(noticeListBody(2)).toBe(
      'Earlier, Lawsuit AI showed “Claim filed” for the settlements below. That was wrong. We never sent anything to a settlement administrator, and we never file claims for anyone. For each one, tell us where things stand.',
    );
  });

  it('counts the bulk answer, its confirmation and "Show all"', () => {
    expect(gotItForAllLabel(3)).toBe('Got it for all 3 that were not real');
    expect(closedOutMessage(1)).toBe('Thanks. We closed out the settlement that was not real.');
    expect(closedOutMessage(3)).toBe('Thanks. We closed out 3 settlements that were not real.');
    expect(showAllNoticesLabel(12)).toBe('Show all 12');
  });

  it('says a fictional settlement was not real, on the claim screen and the dashboard', () => {
    expect(fictionalNoticeText('Robocall TCPA Settlement')).toBe(`“Robocall TCPA Settlement” ${notices.fictionalText.text}`);
    expect(fictionalRowText()).toBe(
      'This settlement was test data that should never have been shown as a real settlement. Lawsuit AI did not file anything, and there is nothing for you to do. Please ignore any earlier message about it.',
    );
  });
});

describe('fillCopy', () => {
  it('fills named placeholders once and leaves unknown ones', () => {
    expect(fillCopy(shared.linkForTitle.text, { label: 'Official site', title: 'Acme {title}' })).toBe(
      'Official site for Acme {title}',
    );
    expect(fillCopy('{a} and {b}', { a: '1' })).toBe('1 and {b}');
  });
});

describe('legal text in the app', () => {
  function LegalProbe() {
    const { status, legal } = useConfig();
    return (
      <>
        <Text testID="status">{status}</Text>
        <Text testID="disclaimer">{legal.disclaimer}</Text>
        <Text testID="short">{legal.short}</Text>
      </>
    );
  }

  it('falls back to the app wording of the disclaimers, which never calls the app a website', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await render(
      <QueryClientProvider client={client}>
        <ConfigProvider>
          <LegalProbe />
        </ConfigProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('unavailable')).toBeOnTheScreen();
    expect(screen.getByTestId('disclaimer')).toHaveTextContent(APP_LEGAL_DISCLAIMER);
    expect(screen.getByTestId('short')).toHaveTextContent(APP_SHORT_DISCLAIMER);
    expect(APP_LEGAL_DISCLAIMER).toContain('Using this app or contacting us');
    expect(`${APP_LEGAL_DISCLAIMER} ${APP_SHORT_DISCLAIMER}`).not.toMatch(/\bthis (web)?site\b/i);
    client.clear();
  });
});
