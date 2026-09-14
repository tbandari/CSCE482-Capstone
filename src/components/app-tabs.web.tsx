import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type MaterialName, type SFName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, WebTabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { name: 'map', href: '/map', label: 'Map', sf: 'map', md: 'map' },
  { name: 'timeline', href: '/timeline', label: 'Timeline', sf: 'clock', md: 'schedule' },
  { name: 'import', href: '/import', label: 'Import', sf: 'square.and.arrow.down', md: 'download' },
  { name: 'settings', href: '/settings', label: 'Settings', sf: 'gearshape', md: 'settings' },
] as const;

export default function AppTabs() {
  const theme = useTheme();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList
        style={{
          height: WebTabBarHeight,
          flexDirection: 'row',
          backgroundColor: theme.backgroundElement,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.separator,
        }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton sf={tab.sf} md={tab.md}>
              {tab.label}
            </TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({
  children,
  isFocused,
  sf,
  md,
  ...props
}: TabTriggerSlotProps & { sf: SFName; md: MaterialName }) {
  const theme = useTheme();
  const color = isFocused ? theme.accent : theme.textTertiary;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.one }}>
        <Icon sf={sf} md={md} size={22} color={color} />
        <ThemedText variant="caption" style={{ color, fontWeight: isFocused ? '600' : '400' }}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}
