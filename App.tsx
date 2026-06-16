import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { 
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
 } from 'react-native';
 import appConfig from './app.json';

 WebBrowser.maybeCompleteAuthSession();

const USER_NAME_STORAGE_KEY = 'mandala:userName';
const PRACTICES_STORAGE_KEY = 'mandala:practices';
const RITAM_SESSION_STORAGE_KEY = 'ritam_session';
const RITAM_YOGA_API_BASE_URL = 'https://ritamyoga.in';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};
const GOOGLE_WEB_CLIENT_ID = appConfig.expo.extra.googleWebClientId;

type Practice = {
  id: string;
  name: string;
  startedAt: string;
  daysCompleted: number;
  durationDays: number;
  lastCompletedAt?: string;
};

type AppSession = {
  accessToken: string;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
};

type RITAMAuthResponse = {
  token?: string;
  user?: AppSession['user'];
};

function getSessionDisplayName(session: Partial<AppSession>) {
  return session.user?.name ?? session.user?.email ?? null;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createNonce() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
async function getGoogleIdentityToken(): Promise<string> {
  if (Platform.OS === 'web') {
    return signInWithGoogleBrowser();
  }

  return signInWithGoogleNative();
}

async function signInWithGoogleBrowser(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Browser Google sign-in needs expo-auth-session and a Google web client ID.');
  }

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    extraParams: {
      nonce: createNonce(),
      prompt: 'select_account',
    },
    redirectUri: AuthSession.makeRedirectUri(),
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);

  if (result.type !== 'success') {
    throw new Error('Google sign-in was cancelled or could not complete.');
  }

  const idToken = result.params.id_token;

  if(!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  return idToken;
}

async function signInWithGoogleNative(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error("Native Google sign-in needs googleWebClientId in app.json.");
  }

 const { GoogleSignin, isCancelledResponse, isSuccessResponse } = await import(
  '@react-native-google-signin/google-signin'
 );
 GoogleSignin.configure({
  scopes: ['profile', 'email'],
  webClientId: GOOGLE_WEB_CLIENT_ID,
 });

 if (Platform.OS === 'android') {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
 }

 const response = await GoogleSignin.signIn();

 if (isCancelledResponse(response)) {
  throw new Error('Google sign-in was cancelled.');
 }

 if(!isSuccessResponse(response)) {
  throw new Error('Google sign-in could not complete.');
 }

 const idToken = response.data.idToken ?? (await GoogleSignin.getTokens()).idToken;

 if (!idToken) {
  throw new Error('Google sign-in did not return an ID token.');
 }

 return idToken;
}

async function exchangeGoogleTokenWithRITAM(idToken: string): Promise<AppSession> {
  const response = await fetch(`${RITAM_YOGA_API_BASE_URL}/api/auth/google`, {
    body: JSON.stringify({ credential: idToken }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if(!response.ok) {
    throw new Error('Ritam sign-in failed. Please try again.');
  }

  const data = (await response.json()) as RITAMAuthResponse;

  if (!data.token) {
    throw new Error('RITAM sign-in returned and unexpected response.');
  }

  return {
    accessToken: data.token,
    user: data.user,
  }
}

async function getStoredRITAMSessionToken() {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(RITAM_SESSION_STORAGE_KEY);
  }

  const SecureStore = await import('expo-secure-store');
  const isSecureStoreAvailable = await SecureStore.isAvailableAsync();

  if (!isSecureStoreAvailable) {
    return AsyncStorage.getItem(RITAM_SESSION_STORAGE_KEY);
  }

  return SecureStore.getItemAsync(RITAM_SESSION_STORAGE_KEY);
}

async function saveRITAMSessionToken(token: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(RITAM_SESSION_STORAGE_KEY, token);
    return;
  }

  const SecureStore = await import('expo-secure-store');
  const isSecureStoreAvailable = await SecureStore.isAvailableAsync();

  if (!isSecureStoreAvailable) {
    await AsyncStorage.setItem(RITAM_SESSION_STORAGE_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(RITAM_SESSION_STORAGE_KEY, token);
}

export default function App() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState('');
  const [practices, setPractices] = useState<Practice[]>([]);
  const [isCreatingPractice, setIsCreatingPractice] = useState(false);
  const [pendingDeletePracticeId, setPendingDeletePracticeId] = useState<string | null>(null);
  const [googleSignInMessage, setGoogleSignInMessage] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canContinue = name.trim().length > 0;
  const canCreatePractice = practiceName.trim().length > 0;
  const pendingDeletePractice = practices.find((practice) => practice.id === pendingDeletePracticeId);
  
  useEffect(() => {
    async function loadSavedData() {
      try {
        const [storedName, storedPractices, storedSessionToken ] = await Promise.all([
          AsyncStorage.getItem(USER_NAME_STORAGE_KEY),
          AsyncStorage.getItem(PRACTICES_STORAGE_KEY),
          getStoredRITAMSessionToken(),
        ]);

        setSavedName(storedName ?? (storedSessionToken ? 'RITAM student' : null));

        if (storedPractices) {
          setPractices(JSON.parse(storedPractices));
        }
      } catch (error) {
        setErrorMessage('Could not load your mandala. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSavedData();
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

  async function signInWithGoogle() {
    setErrorMessage('');
    setIsGoogleSigningIn(true);
    setGoogleSignInMessage('Starting Google sign-in...');

    try {
      const idToken = await getGoogleIdentityToken();
      const session = await exchangeGoogleTokenWithRITAM(idToken);

      await saveRITAMSessionToken(session.accessToken);
      setSavedName(getSessionDisplayName(session) ?? 'RITAM student');
      setGoogleSignInMessage('Signed in. Practice sync can now use your RITAM session.')
    } catch (error) {
      setGoogleSignInMessage(
        error instanceof Error ? error.message : 'Could not start Google sign-in. Please try again.',
      );
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  async function createPractice() {
    const trimmedPracticeName = practiceName.trim();
    
    if (!trimmedPracticeName) {
      return;
    }

    const nextPractices: Practice[] = [
      {
        id: Date.now().toString(),
        name: trimmedPracticeName,
        startedAt: new Date().toISOString(),
        daysCompleted: 0,
        durationDays: 48,
      },
      ...practices,
    ];

    setIsSaving(true);
    setErrorMessage('');

    try {
      await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
      setPractices(nextPractices);
      setPracticeName('');
      setIsCreatingPractice(false);
    } catch (error) {
      setErrorMessage('Could not save your practice. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function completePracticeToday(practiceId: string) {
    const today = getLocalDateKey();
    const practice = practices.find((item) => item.id === practiceId);

    if (
      !practice ||
      practice.lastCompletedAt === today ||
      practice.daysCompleted >= practice.durationDays
    ) {
      return;
    }

    const nextPractices = practices.map((item) => 
      item.id === practiceId
        ? {
          ...item,
          daysCompleted: Math.min(item.daysCompleted + 1, item.durationDays),
          lastCompletedAt: today,
          }
         : item,
    );

    setIsSaving(true);
    setErrorMessage('');

    try {
       await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
       setPractices(nextPractices);
     } catch (error) {
       setErrorMessage('Could not update your practice. Please try again.');
     } finally {
       setIsSaving(false);
     }
   }

  function confirmDeletePractice(practiceId: string) {
    setPendingDeletePracticeId(practiceId);
  }
 
  async function deletePractice(practiceId: string) {
    const nextPractices = practices.filter((practice) => practice.id !== practiceId);

    setIsSaving(true);
    setErrorMessage('');
    
    try {
      await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
      setPractices(nextPractices);
      setPendingDeletePracticeId(null);
    } catch (error) {
      setErrorMessage('Could not delete your practice. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // async function resetName() {
  //   setIsSaving(true);
  //   setErrorMessage('');

  //   try {
  //     await AsyncStorage.removeItem(USER_NAME_STORAGE_KEY);
  //     setName('');
  //     setSavedName(null);
  //   } catch (error) {
  //     console.error('Error resetting name:', error);
  //     setErrorMessage('Could not reset your name. Please try again.');
  //   } finally {
  //     setIsSaving(false);
  //   }
  // }

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
        <ScrollView contentContainerStyle={styles.dashboardContent}>
          <View style={styles.dashboardHeader}>
            <View style={styles.ornament}>
              <View style={styles.ornamentRule} />
              <Text style={styles.ornamentGlyph}>✻</Text>
              <View style={styles.ornamentRule} />
            </View>

            <Text style={styles.eyebrow}>Welcome back, {savedName}</Text>
            <Text style={styles.title}>Your Mandala Garden</Text>
            <Text style={styles.subtitle}>
              Each practice is a seed. With daily discipline, it blooms over 48 days. 
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.mandalaBadge}>
              <Text style={styles.mandalaBadgeText}>Private garden</Text>
            </View>

            <Text style={styles.sectionTitle}>Start a new practice</Text>
            <Text style={styles.sectionSubtitle}>
              Name the sadhana you want to hold for this mandala.
            </Text>

            {isCreatingPractice ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Practice name</Text>
                <TextInput
                  autoCapitalize="sentences"
                  onChangeText={setPracticeName}
                  placeholder="e.g. Morning meditation"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  style={styles.input}
                  value={practiceName}
                />

                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canCreatePractice || isSaving}
                    onPress={createPractice}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.actionRowButton,
                      (!canCreatePractice || isSaving) && styles.primaryButtonDisabled,
                      pressed && canCreatePractice && !isSaving && styles.pressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>{isSaving ? 'Planting...' : 'Plant'}</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => {
                      setPracticeName('');
                      setIsCreatingPractice(false);
                    }}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.actionRowButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsCreatingPractice(true)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Start a new practice</Text>
              </Pressable>
            )}

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Existing practices</Text>
            <Text style={styles.sectionSubtitle}>
              Your mandalas will appear here as flowers in your garden.
            </Text>

            {practices.length === 0 ? (
              <View style={styles.emptyGarden}>
                <Text style={styles.emptyGardenFlower}>🌱</Text>
                <Text style={styles.helperText}>Your garden is empty. Start a practice to see it bloom here.</Text>
              </View>
            ) : (
              <View style={styles.practiceList}>
                {practices.map(practice => (
                  <PracticeCard
                    key={practice.id}
                    isSaving={isSaving}
                    onCompleteToday={completePracticeToday}
                    onDelete={confirmDeletePractice}
                    practice={practice}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <Modal
          animationType="fade"
          onRequestClose={() => setPendingDeletePracticeId(null)}
          transparent
          visible={Boolean(pendingDeletePractice)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.confirmDialog}>
              <View style={styles.mandalaBadge}>
                <Text style={styles.mandalaBadgeText}>Confirm delete</Text>
              </View>

              <Text style={styles.confirmTitle}>Delete practice?</Text>
              <Text style={styles.confirmMessage}>
                {`This will remove "${pendingDeletePractice?.name}" and its progress.`}
              </Text>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole='button'
                  disabled={isSaving}
                  onPress={() => setPendingDeletePracticeId(null)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.actionRowButton,
                    isSaving && styles.primaryButtonDisabled,
                    pressed && !isSaving && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  accessibilityRole='button'
                  disabled={isSaving || !pendingDeletePractice}
                  onPress={() => {
                    if (pendingDeletePractice) {
                      void deletePractice(pendingDeletePractice.id);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.dangerButton,
                    styles.actionRowButton,
                    (isSaving || !pendingDeletePractice) && styles.primaryButtonDisabled,
                    pressed && !isSaving && pendingDeletePractice && styles.pressed,
                  ]}
                  >
                    <Text style={styles.primaryButtonText}>{isSaving ? 'Deleting...' : 'Delete'}</Text>
                  </Pressable>

              </View>
            </View>
          </View>
        </Modal>
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

          <Pressable
            accessibilityHint='Start Google sign-in for syncing your practices'
            accessibilityRole='button'
            disabled={isGoogleSigningIn}
            onPress={signInWithGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              isGoogleSigningIn && styles.primaryButtonDisabled,
              pressed && !isGoogleSigningIn && styles.pressed
            ]}
          >
            <Text style={styles.googleGlyph}>G</Text>
            <Text style={styles.googleButtonText}>
              {isGoogleSigningIn ? 'Starting Google...' : 'Continue with Google'}
            </Text>
          </Pressable>

          {googleSignInMessage ? (
            <Text style={styles.syncStatusText}>{googleSignInMessage}</Text>
          ) : null }

          <View style={styles.dividerRow}>
            <View style={styles.dividerRule} />
            <Text style={styles.dividerText}>or continue locally</Text>
            <View style={styles.dividerRule} />
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
            Google sync will use your Ritam account. Local setup keeps this mandala on
            this device for now.
          </Text>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PracticeCard({
    isSaving,
    onCompleteToday,
    onDelete,
    practice,
}: {
    isSaving: boolean;
    onCompleteToday: (practiceId: string) => void;
    onDelete: (practiceId: string) => void;
    practice: Practice;
}) {
    const progress = Math.round((practice.daysCompleted / practice.durationDays) * 100);
    const startedAt = new Date(practice.startedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const isComplete = practice.daysCompleted >= practice.durationDays;
    const isCompletedToday = practice.lastCompletedAt === getLocalDateKey();
    const canCompleteToday = !isSaving && !isComplete && !isCompletedToday;
    const statusText = isComplete
      ? 'Mandala Complete'
      : isCompletedToday
        ? 'Completed today'
        : 'Tap to mark today complete';

    return (
      <View style={styles.practiceCard}>
        <Pressable
          accessibilityHint={statusText}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCompleteToday }}
          disabled={!canCompleteToday}
          onPress={() => onCompleteToday(practice.id)}
          style={({ pressed }) => [
            styles.practiceTapArea,
            !canCompleteToday && styles.practiceTapAreaDisabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.flowerMark}>
            <Text style={styles.flowerText}>✻</Text>
          </View>

          <View style={styles.practiceDetails}>
            <Text style={styles.practiceName}>{practice.name}</Text>
            <Text style={styles.practiceMeta}>
              Started {startedAt} . {practice.daysCompleted} of {practice.durationDays} days complete
            </Text>
            <Text style={styles.practiceStatus}>{statusText}</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(progress, 4)}%` }]} />
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityHint={`Delete ${practice.name}`}
        accessibilityRole="button"
        disabled={isSaving}
        onPress={() => onDelete(practice.id)}
        style={({ pressed }) => [
          styles.deleteButton,
          isSaving && styles.deleteButtonDisabled,
          pressed && !isSaving && styles.pressed,
        ]}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </Pressable>
    </View>
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
  dashboardContent: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  dashboardHeader: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    width: '100%',
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionRowButton: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    marginTop: 0,
    minWidth: 0,
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
  googleButton: {
    alignItems: 'center',
    backgroundColor: theme.backgroundElement,
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  googleGlyph: {
    color: theme.clay,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  googleButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  syncStatusText: {
    backgroundColor: theme.backgroundSelected,
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    color: theme.peacock,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dividerRule: {
    backgroundColor: theme.rule,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 16,
    textTransform: 'uppercase',
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
  dangerButton: {
    alignItems: 'center',
    backgroundColor: theme.clay,
    borderColor: theme.clay,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
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
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(31, 22, 17, 0.42)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmDialog: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.rule,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
    maxWidth: 400,
    paddingHorizontal: 24,
    paddingVertical: 24,
    shadowColor: '#1F1611',
    shadowOffset: { width: 0, height: 18},
    shadowOpacity: 0.24,
    shadowRadius: 24,
    width: '100%',
  },
  confirmTitle: {
    color: theme.text,
    fontFamily: Platform.select( { ios: 'ui-serif', default: 'serif' }),
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 34,
  },
  confirmMessage: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  sectionTitle: {
    color: theme.text,
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  sectionSubtitle: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  emptyGarden: {
    alignItems: 'center',
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyGardenFlower: {
    color: theme.marigold,
    fontSize: 34,
    lineHeight: 38,
  },
  practiceList: {
    gap: 12,
  },
  practiceCard: {
    alignItems: 'center',
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  practiceTapArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
  },
  practiceTapAreaDisabled: {
    opacity: 0.72,
  },
  flowerMark: {
    alignItems: 'center',
    backgroundColor: theme.backgroundSelected,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  flowerText: {
    color: theme.marigold,
    fontSize: 28,
    lineHeight: 32,
  },
  practiceDetails: {
    flex: 1,
    gap: 6,
  },
  practiceName: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  practiceMeta: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  practiceStatus: {
    color: theme.peacock,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  progressTrack: {
    backgroundColor: theme.backgroundSelected,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: theme.peacock,
    borderRadius: 999,
    height: '100%',
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
 },
  deleteButtonDisabled: {
    opacity: 0.45,
  },
  deleteButtonText: {
    color: theme.clay,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  errorText: {
    color: theme.clay,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
});
