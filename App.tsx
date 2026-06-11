import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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

const USER_NAME_STORAGE_KEY = 'mandala:userName';

export default function App() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canContinue = name.trim().length > 0;
  
  useEffect(() => {
    async function loadSavedName() {
      try {
        const storedName = await AsyncStorage.getItem(USER_NAME_STORAGE_KEY);
        setSavedName(storedName);
      } catch (error) {
        console.error('Error loading saved name:', error);
        setErrorMessage('Could not load your saved name. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSavedName();
  }, []);

  async function saveName() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    
    try {
      await AsyncStorage.setItem(USER_NAME_STORAGE_KEY, trimmedName);
      setSavedName(trimmedName);
    } catch (error) {
      console.error('Error saving name:', error);
      setErrorMessage('Could not save your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function resetName() {
    setIsSaving(true);
    setErrorMessage('');

    try {
      await AsyncStorage.removeItem(USER_NAME_STORAGE_KEY);
      setName('');
      setSavedName(null);
    } catch (error) {
      console.error('Error resetting name:', error);
      setErrorMessage('Could not reset your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>48-day sadhana tracker</Text>
          <Text style={styles.loadingText}>Preparing your mandala...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (savedName) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.keyboardView}>
          <View style={styles.header}>
            <View style={styles.ornament}>
              <View style={styles.ornamentRule} />
              <Text style={styles.ornamentGlyph}>✻</Text>
              <View style={styles.ornamentRule} />
            </View>

            <Text style={styles.eyebrow}>Welcome back</Text>
            <Text style={styles.title}>{savedName}</Text>
            <Text style={styles.subtitle}>
              Your mandala setup has started. Next we can add your practice, start date,
              and daily tracking. 
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.mandalaBadge}>
              <Text style={styles.mandalaBadgeText}>Day 1 of 48</Text>
            </View>

            <Text style={styles.helperText}>
              Your name is saved locally on this device. The name setup screen will
              skipped next time you open the app.
            </Text>

            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={resetName}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Reset Name</Text>
            </Pressable>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
            Begin with your name. Your practice, start date and daily tracking is coming. 
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.mandalaBadge}>
            <Text style={styles.mandalaBadgeText}>Day 1 of 48</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              autoCapitalize="words"
              autoComplete="name"
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              style={styles.input}
              value={name}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canContinue || isSaving}
            onPress={saveName}
            style={({ pressed }) => [
              styles.primaryButton,
              (!canContinue || isSaving) && styles.primaryButtonDisabled,
              pressed && canContinue && !isSaving && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
          </Pressable>

          <Text style={styles.helperText}>
            No account or password yet. This is a private first-launch setup for a single
            user's mandala.
          </Text>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
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
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
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
  secondaryButton: {
    alignItems: 'center',
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    color: theme.marigoldDeep,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
  loadingText: {
    color: theme.text,
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 22,
    lineHeight: 32,
    textAlign: 'center',
  },
  helperText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    color: theme.clay,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
});
