import { Redirect } from 'expo-router';

import { useSetting } from '@/lib/settings';

export default function IndexRoute() {
  const onboarded = useSetting('onboardingComplete');
  return <Redirect href={onboarded ? '/map' : '/onboarding'} />;
}
