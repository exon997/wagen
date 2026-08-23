// URL polyfill MORA biti prvi import - supabase-js ga treba na Hermesu
// (poznati uzrok tihih gresaka u React Nativeu bez njega).
import 'react-native-url-polyfill/auto';
import { Component, useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import { ensureSession } from '@/lib/supabase';
import { syncAllSessions } from '@/lib/sync';
import { installCrashLogger } from '@/lib/crash-log';

installCrashLogger();

/**
 * Render greske ne smiju tiho rusiti app (preview build nema dev overlay) -
 * boundary ih prikaze na ekranu, citljivo za teren.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Greska u aplikaciji</Text>
          <Text style={styles.errorText}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  // 4.3: anonimna sesija na startu - bez registracijske vratarnice
  useEffect(() => {
    ensureSession()
      .then(() => syncAllSessions())
      .catch((e: unknown) => console.warn('Sesija/sync pri startu nije uspio:', e));
  }, []);

  return (
    <ErrorBoundary>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#FFFFFF',
        }}
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, backgroundColor: '#000000', padding: 24, paddingTop: 64 },
  errorTitle: { color: '#FF5555', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  errorText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace' },
});
