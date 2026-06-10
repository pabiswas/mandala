import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { 
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
 } from 'react-native';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canContinue = email.trim().length > 0 && password.length > 0;
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View style={styles.ornament}>
            <View style={styles.ornamentRule} />
            <Text style={styles.ornamentGlyph}>✻</Text>
            <View style={styles.ornamentRule} />
          </View>

          <Text style={styles.eyebrow}>48-day sadhana tracker</Text>
          <Text style={styles.title}>Mandala</Text>
          <Text style={styles.subtitle}>
            Sign in to continue your daily practice with discipline, devotion, and a steady
            record of your commitment.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.mandalaBadge}>
            <Text style={styles.mandalaBadgeText}>Day 1 of 48</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecondary}
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canContinue}
            style={({ pressed }) => [
              styles.primaryButton,
              !canContinue && styles.primaryButtonDisabled,
              pressed && canContinue && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Begin tracking</Text>
          </Pressable>

          <Text style={styles.helperText}>
            This is a private single-user login shell. We can wire storage and the 48-day
            mandala flow after the screens are designed.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const theme = {
  text: '#1F1611',
  background: '#F7F2E4',
  backgroundElement: '#FFFFFF',
  backgroundSelected: '#ECE4CF',
  textSecondary: '#4E3A2A',
  marigold: '#E08B3C',
  marigoldDeep: '#9C4F12',
  clay: '#B8542D',
  rule: '#D9CFB8',
  peacock: '#1F6A6E',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  keyboardView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    width: '100%',
  },
  ornament: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginBottom: 4,
  },
  ornamentRule: {
    backgroundColor: theme.rule,
    height: 1,
    width: 48,
  },
  ornamentGlyph: {
    color: theme.marigold,
    fontSize: 18,
    lineHeight: 20,
  },
  eyebrow: {
    color: theme.marigoldDeep,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.5,
    lineHeight: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.text,
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 48,
    fontWeight: '500',
    letterSpacing: -0.25,
    lineHeight: 54,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.textSecondary,
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 20,
    lineHeight: 31,
    maxWidth: 440,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.rule,
    borderRadius: 10,
    borderWidth: 1,
    gap: 16,
    maxWidth: 440,
    paddingHorizontal: 24,
    paddingVertical: 24,
    shadowColor: '#4A2F15',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: '100%',
  },
  mandalaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.backgroundSelected,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  mandalaBadgeText: {
    color: theme.peacock,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.clay,
    borderColor: theme.clay,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
  helperText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
  },
});
