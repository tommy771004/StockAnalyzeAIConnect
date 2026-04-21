/**
 * useDeviceType.ts — Platform-aware rendering hook
 *
 * Provides device type detection for responsive UI decisions.
 * Separates mobile/tablet/desktop breakpoints and detects touch capability.
 */
import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface DeviceInfo {
  /** Current device category based on viewport width */
  device: DeviceType;
  /** True if viewport < 768px */
  isMobile: boolean;
  /** True if viewport >= 768px and < 1024px */
  isTablet: boolean;
  /** True if viewport >= 1024px */
  isDesktop: boolean;
  /** True if the device supports touch input */
  isTouch: boolean;
  /** True if running inside Electron */
  isElectron: boolean;
  /** Current viewport width */
  width: number;
  /** Current viewport height */
  height: number;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

function getDeviceType(width: number): DeviceType {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

function getIsTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function getIsElectron(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as Window & { electronAPI?: unknown }).electronAPI);
}

export function useDeviceType(): DeviceInfo {
  const [state, setState] = useState<DeviceInfo>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const h = typeof window !== 'undefined' ? window.innerHeight : 768;
    const device = getDeviceType(w);
    return {
      device,
      isMobile: device === 'mobile',
      isTablet: device === 'tablet',
      isDesktop: device === 'desktop',
      isTouch: getIsTouch(),
      isElectron: getIsElectron(),
      width: w,
      height: h,
    };
  });

  const handleResize = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const device = getDeviceType(w);
    setState(prev => {
      // Only update if something actually changed to avoid re-renders
      if (prev.width === w && prev.height === h) return prev;
      return {
        device,
        isMobile: device === 'mobile',
        isTablet: device === 'tablet',
        isDesktop: device === 'desktop',
        isTouch: prev.isTouch,
        isElectron: prev.isElectron,
        width: w,
        height: h,
      };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return state;
}

export default useDeviceType;
