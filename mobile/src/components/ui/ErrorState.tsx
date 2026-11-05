import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { common } from '@/copy/common';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { RefreshCw, type LucideIcon } from './icons';

export interface ErrorStateProps {
  /** Retry the failed load. */
  onRetry: () => void;
  /** Defaults to "We couldn’t load this screen". */
  title?: string;
  /** Defaults to the web's "This is on our side, not yours…"; pass an ApiFailure's `error` for network problems. */
  body?: string;
  retrying?: boolean;
  icon?: LucideIcon;
  /** A secondary action under "Try again", such as "Browse settlements". */
  secondaryAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Honest load error with a retry (the web's error.tsx pages). Never shows guessed data. */
export function ErrorState({
  onRetry,
  title = common.loadErrorTitle.text,
  body = common.loadErrorBody.text,
  retrying = false,
  icon = RefreshCw,
  secondaryAction,
  style,
  testID,
}: ErrorStateProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      body={body}
      style={style}
      testID={testID}
      action={
        <>
          <Button label={common.tryAgain.text} onPress={onRetry} loading={retrying} fullWidth />
          {secondaryAction}
        </>
      }
    />
  );
}
