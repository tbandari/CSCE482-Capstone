import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type PlatformNames = Exclude<SymbolViewProps['name'], string>;
/** SF Symbol name (iOS). */
export type SFName = NonNullable<PlatformNames['ios']>;
/** Material Symbol name (Android and web). */
export type MaterialName = NonNullable<PlatformNames['android']>;

export interface IconProps {
  sf: SFName;
  md: MaterialName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
}

/** One icon family per platform: SF Symbols on iOS, Material Symbols elsewhere. */
export function Icon({ sf, md, size = 20, color, style }: IconProps) {
  return (
    <SymbolView
      name={{ ios: sf, android: md, web: md }}
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
