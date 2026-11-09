import { createContext, useContext } from 'react';

/**
 * True for screens shown above the native tab bar. The (tabs) layout
 * provides it. Native tabs already keep content clear of the tab bar (Android
 * pads for it, iOS insets the first scroll view), so screens must not add the
 * bottom safe area again.
 */
export const InsideTabBarContext = createContext(false);

export function useInsideTabBar(): boolean {
  return useContext(InsideTabBarContext);
}
