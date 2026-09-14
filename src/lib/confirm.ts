import { Alert } from 'react-native';

/** Native confirmation alert; `window.confirm` on web where Alert has no buttons. */
export function confirmAsync(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (process.env.EXPO_OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
