/**
 * Orbit design tokens. This is the single source of visual truth: components
 * import from here, screens import components. Values that appear twice belong
 * in this file.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#5B6472',
    textTertiary: '#8A94A3',
    background: '#FFFFFF',
    backgroundGrouped: '#F3F4F7',
    backgroundElement: '#F0F1F4',
    backgroundSelected: '#E2E4EA',
    separator: '#E3E5EA',
    accent: '#2563EB',
    accentContrast: '#FFFFFF',
    accentSoft: '#DBEAFE',
    success: '#15803D',
    warning: '#B45309',
    danger: '#DC2626',
  },
  dark: {
    text: '#F5F7FA',
    textSecondary: '#A6ADBA',
    textTertiary: '#6F7887',
    background: '#0B0D12',
    backgroundGrouped: '#0B0D12',
    backgroundElement: '#171A21',
    backgroundSelected: '#232833',
    separator: '#262B35',
    accent: '#60A5FA',
    accentContrast: '#0B1220',
    accentSoft: '#1E3A8A',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;
export type Theme = { [K in ThemeColor]: string };

/** Colors drawn inside the Leaflet map, which cannot read the React theme. */
export const MapColors = {
  path: '#2563EB',
  visit: '#2563EB',
  visitStroke: '#FFFFFF',
  focus: '#F59E0B',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** 4-point grid. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  eight: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const MaxContentWidth = 720;

/** Height of the custom web tab bar; screens on web reserve this much at the bottom. */
export const WebTabBarHeight = 64;
