import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  View,
  type HostInstance,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Places on the claim screen it scrolls to and moves screen-reader focus to,
 * as the web moves focus after an answer (ClaimFlow.tsx):
 * - 'step3': Step 3, when the official site's browser closes after Step 2.
 * - 'announcement': the "Saved…" confirmation after every claim change.
 * - 'yourClaim': the "Your claim" card, focused when a report succeeds.
 *
 * Each FlowTarget must be a direct child of the scroll view's content, so its
 * layout y is its offset in the content. A target that is not laid out yet
 * is scrolled to (and focused) as soon as it is.
 */
export type FlowTargetName = 'announcement' | 'yourClaim' | 'step3';

export interface FlowTargets {
  /** Scrolls `target` to the top of the visible area and moves focus to `focus` (if any). */
  reveal(target: FlowTargetName, focus?: FlowTargetName): void;
  setPosition(name: FlowTargetName, y: number): void;
  attach(name: FlowTargetName, node: HostInstance | null): void;
  detach(name: FlowTargetName): void;
  setFocusNode(name: FlowTargetName, node: HostInstance): void;
  clearFocusNode(name: FlowTargetName, node: HostInstance): void;
}

export interface FlowTargetOptions {
  /** How far from the scroll view's top a target lands: what covers it (a header) plus breathing room. */
  topInset: () => number;
  animated: boolean;
}

export function useFlowTargets(scrollRef: RefObject<ScrollViewInstance | null>, options: FlowTargetOptions): FlowTargets {
  const latestOptions = useRef(options);
  useEffect(() => {
    latestOptions.current = options;
  });
  const state = useRef({
    positions: new Map<FlowTargetName, number>(),
    nodes: new Map<FlowTargetName, HostInstance>(),
    pendingScroll: null as FlowTargetName | null,
    pendingFocus: null as FlowTargetName | null,
  });

  // Every method runs in an event or effect, never during render, so the refs are read there.
  return useMemo<FlowTargets>(() => {
    function scrollNow(name: FlowTargetName): boolean {
      const y = state.current.positions.get(name);
      if (y === undefined) return false;
      const { topInset, animated } = latestOptions.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - topInset()), animated });
      return true;
    }

    function focusNow(name: FlowTargetName): boolean {
      const node = state.current.nodes.get(name);
      if (!node || !state.current.positions.has(name)) return false;
      AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
      return true;
    }

    return {
      reveal(target, focus) {
        state.current.pendingScroll = scrollNow(target) ? null : target;
        state.current.pendingFocus = focus && !focusNow(focus) ? focus : null;
      },
      setPosition(name, y) {
        const s = state.current;
        s.positions.set(name, y);
        if (s.pendingScroll === name && scrollNow(name)) s.pendingScroll = null;
        if (s.pendingFocus === name && focusNow(name)) s.pendingFocus = null;
      },
      attach(name, node) {
        if (node) state.current.nodes.set(name, node);
      },
      detach(name) {
        state.current.positions.delete(name);
        state.current.nodes.delete(name);
      },
      setFocusNode(name, node) {
        const s = state.current;
        s.nodes.set(name, node);
        if (s.pendingFocus === name && focusNow(name)) s.pendingFocus = null;
      },
      clearFocusNode(name, node) {
        if (state.current.nodes.get(name) === node) state.current.nodes.delete(name);
      },
    };
  }, [scrollRef]);
}

const FlowTargetsContext = createContext<FlowTargets | null>(null);

export function FlowTargetsProvider({ value, children }: { value: FlowTargets; children: ReactNode }) {
  return <FlowTargetsContext.Provider value={value}>{children}</FlowTargetsContext.Provider>;
}

/** The screen's targets (null outside the claim screen, where reveal does nothing). */
export function useFlowTargetsApi(): FlowTargets | null {
  return useContext(FlowTargetsContext);
}

export interface FlowTargetProps {
  name: FlowTargetName;
  children: ReactNode;
  /** This view itself takes focus (it must then be accessible with a label). */
  focusable?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A direct child of the claim screen's scroll content that can be scrolled to. */
export function FlowTarget({ name, children, focusable = false, accessible, accessibilityLabel, style, testID }: FlowTargetProps) {
  const targets = useFlowTargetsApi();
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => targets?.setPosition(name, event.nativeEvent.layout.y),
    [targets, name],
  );
  const ref = useCallback(
    (node: HostInstance | null) => {
      if (!targets || !node) return undefined;
      targets.attach(name, focusable ? node : null);
      return () => targets.detach(name);
    },
    [targets, name, focusable],
  );
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      collapsable={false}
      style={style}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** A ref for the element inside a target that takes focus, such as the "Your claim" heading. */
export function useFocusNode(name: FlowTargetName) {
  const targets = useFlowTargetsApi();
  return useCallback(
    (node: HostInstance | null) => {
      if (!targets || !node) return undefined;
      targets.setFocusNode(name, node);
      return () => targets.clearFocusNode(name, node);
    },
    [targets, name],
  );
}
