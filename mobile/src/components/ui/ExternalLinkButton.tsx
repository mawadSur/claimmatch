import type { WebBrowserResult } from 'expo-web-browser';
import { useRef } from 'react';

import { common } from '@/copy/common';
import { openExternalUrl, toSafeWebUrl } from '@/lib/external-link';

import { Button, type ButtonProps } from './Button';
import { ExternalLink } from './icons';

export interface ExternalLinkButtonProps extends Omit<ButtonProps, 'onPress' | 'icon' | 'iconPosition' | 'loading'> {
  url: string;
  /**
   * Called with the browser result: on iOS when the in-app browser closes, on
   * Android when it opens. Null when it could not open in-app.
   */
  onBrowserResult?: (result: WebBrowserResult | null) => void;
}

/**
 * Opens a website (official settlement site, source page, web legal pages)
 * in the brand-tinted in-app browser. Announced as a link; disabled when the
 * URL is not a website.
 */
export function ExternalLinkButton({
  url,
  onBrowserResult,
  variant = 'secondary',
  disabled,
  accessibilityHint,
  ...rest
}: ExternalLinkButtonProps) {
  const safeUrl = toSafeWebUrl(url);
  const opening = useRef(false);

  async function open() {
    if (!safeUrl || opening.current) return;
    opening.current = true;
    try {
      // Open first: `onBrowserResult?.(await …)` would skip the open when there is no callback.
      const result = await openExternalUrl(safeUrl);
      onBrowserResult?.(result);
    } finally {
      opening.current = false;
    }
  }

  return (
    <Button
      {...rest}
      variant={variant}
      icon={ExternalLink}
      iconPosition="trailing"
      disabled={disabled || !safeUrl}
      accessibilityRole="link"
      accessibilityHint={accessibilityHint ?? common.opensInBrowserHint.text}
      onPress={() => {
        void open();
      }}
    />
  );
}
