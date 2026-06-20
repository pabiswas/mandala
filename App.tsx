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
  useWindowDimensions,
  View,
 } from 'react-native';
 import appConfig from './app.json';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

 WebBrowser.maybeCompleteAuthSession();

const USER_NAME_STORAGE_KEY = 'mandala:userName';
const PRACTICES_STORAGE_KEY = 'mandala:practices';
const RITAM_SESSION_STORAGE_KEY = 'ritam_session';
const RITAM_YOGA_API_BASE_URL = 'https://ritamyoga.in';
const STACKED_PRACTICE_CARD_GAP = 12;
const STACKED_PRACTICE_CARD_EDGE_INSET = 1;
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};
const GOOGLE_WEB_CLIENT_ID = appConfig.expo.extra.googleWebClientId;

type Practice = {
  id: string;
  name: string;
  startedAt?: string;
  daysCompleted: number;
  durationDays: number;
  lastCompletedAt?: string;
  showOwnerName?: boolean;
  visibility?: string;
};

type PracticeLayout = 'list' | 'stack';

type AppSession = {
  accessToken: string;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
};

type GoogleIdentity = {
  displayName?: string | null;
  idToken: string;
};

type GoogleIdentityTokenClaims = {
  email?: string;
  given_name?: string;
  name?: string;
};

type RITAMAuthResponse = {
  token?: string;
  user?: AppSession['user'];
};

type RITAMAuthConfigResponse = {
  dev_login_available?: boolean;
  google_client_id?: string;
  ok?: boolean;
  policy_url?: string;
  policy_version?: string;
};

type RITAMMandala = {
  days_done?: number;
  done_today?: boolean;
  habit_title?: string;
  id: string;
  show_owner_name?: boolean;
  visibility?: string;
};

type RITAMMandalasResponse = {
  active?: RITAMMandala[];
  ok?: boolean;
};

type RITAMRequestOptions = {
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string;
};

function getSessionDisplayName(session: Partial<AppSession>) {
  return session.user?.name?.trim() || session.user?.email?.trim() || null;
}

function getGoogleDisplayNameFromClaims(claims: GoogleIdentityTokenClaims | null) {
  return claims?.name?.trim() || claims?.given_name?.trim() || claims?.email?.trim() || null;
}

function getGoogleIdentityTokenClaims(idToken: string): GoogleIdentityTokenClaims | null {
  const payload = idToken.split('.')[1];

  if (!payload || typeof globalThis.atob !== 'function') {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binaryPayload = globalThis.atob(paddedBase64);
    const jsonPayload = decodeURIComponent(
      Array.from(binaryPayload)
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
    );

    return JSON.parse(jsonPayload) as GoogleIdentityTokenClaims;
  } catch {
    return null;
  }
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
async function getGoogleIdentityToken(): Promise<GoogleIdentity> {
  if (Platform.OS === 'web') {
    return signInWithGoogleBrowser();
  }

  return signInWithGoogleNative();
}

async function signInWithGoogleBrowser(): Promise<GoogleIdentity> {
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

  return {
    displayName: getGoogleDisplayNameFromClaims(getGoogleIdentityTokenClaims(idToken)),
    idToken,
  };
}

async function signInWithGoogleNative(): Promise<GoogleIdentity> {
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

  console.log(response)
  return {
    displayName: 
      response.data.user.name?.trim() || getGoogleDisplayNameFromClaims(getGoogleIdentityTokenClaims(idToken)),
    idToken,
  };
}


async function ritamRequest<T>(endpoint: string, options: RITAMRequestOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${RITAM_YOGA_API_BASE_URL}${endpoint}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? 'GET',
  });

  if (!response.ok) {
    throw new Error(`RITAM request ailed: ${endpoint}`);
  }

  const responseText = await response.text();

  return (responseText ? JSON.parse(responseText) : undefined) as T;
}

async function exchangeGoogleTokenWithRITAM(idToken: string): Promise<AppSession> {
  const data = await ritamRequest<RITAMAuthResponse>('/api/auth/google', {
    body: { credential: idToken, consent: "yes" },
    method: 'POST',
  });

  if (!data.token) {
    throw new Error('RITAM sign-in returned and unexpected response.');
  }

  return {
    accessToken: data.token,
    user: data.user,
  }
}

async function fetchRITAMAuthConfig() {
  const data = await ritamRequest<RITAMAuthConfigResponse>('/api/auth/config');

  if (!data.ok || !data.policy_url) {
    throw new Error('RITAM returned an unexpected auth config.');
  }

  return data;
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

async function clearRITAMSessionToken() {
  await AsyncStorage.removeItem(RITAM_SESSION_STORAGE_KEY);

  if (Platform.OS === 'web') {
    return;
  }

  const SecureStore = await import('expo-secure-store');
  const isSecureStoreAvailable = await SecureStore.isAvailableAsync();

  if(isSecureStoreAvailable) {
    await SecureStore.deleteItemAsync(RITAM_SESSION_STORAGE_KEY);
  }
}

async function signOutFromGoogle() {
  if (Platform.OS === 'web') {
    return;
  }

  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  await GoogleSignin.signOut();
}

function normalizeRITAMMandala(mandala: RITAMMandala): Practice {
  return {
    daysCompleted: mandala.days_done ?? 0,
    durationDays: 48,
    id: mandala.id,
    lastCompletedAt: mandala.done_today ? getLocalDateKey() : undefined,
    name: mandala.habit_title?.trim() || 'Untitled mandala',
    showOwnerName: mandala.show_owner_name,
    visibility: mandala.visibility,
  };
}

async function fetchRITAMMandalas(sessionToken: string) {
  const data = await ritamRequest<RITAMMandalasResponse>(`/api/mandalas?today=${getLocalDateKey()}`, {
    token: sessionToken,
  });

  if (!data.ok || !Array.isArray(data.active)) {
    throw new Error('RITAM returned unexpected mandala list.');
  }

  return data.active.map(normalizeRITAMMandala);
}

async function createRITAMMandala(sessionToken: string, habitTitle: string) {
  await ritamRequest<unknown>('/api/mandalas', {
    body: {
      habit_title: habitTitle,
      today: getLocalDateKey(),
    },
    method: 'POST',
    token: sessionToken
  });
}

async function checkInRITAMMandala(sessionToken: string, mandalaId: string) {
  await ritamRequest<unknown>(`/api/mandalas/${encodeURIComponent(mandalaId)}/checkin`, {
    body: {
      day_local: getLocalDateKey(),
    },
    method: 'POST',
    token: sessionToken,
  });
}

async function endRITAMMandala(sessionToken: string, mandalaId: string) {
  await ritamRequest<unknown>(`/api/mandalas/${encodeURIComponent(mandalaId)}/end`, {
    method: 'POST',
    token: sessionToken
  })
}

export default function App() {
  const { width: windowWidth } = useWindowDimensions();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState('');
  const [practices, setPractices] = useState<Practice[]>([]);
  const [practiceLayout, setPracticeLayout] = useState<PracticeLayout>('list');
  const [authConfig, setAuthConfig] = useState<RITAMAuthConfigResponse | null>(null);
  const [hasAcceptedPolicy, setHasAcceptedPolicy] = useState(false);
  // const [hasAcceptedPolicy, setHasAcceptedPolicy] = useState(__DEV__);
  const [isCreatingPractice, setIsCreatingPractice] = useState(false);
  const [pendingDeletePracticeId, setPendingDeletePracticeId] = useState<string | null>(null);
  const [googleSignInMessage, setGoogleSignInMessage] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isLoadingAuthConfig, setIsLoadingAuthConfig] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canContinue = name.trim().length > 0;
  const canCreatePractice = practiceName.trim().length > 0;
  const stackedPracticeCardWidth = Math.max(220, Math.min(windowWidth - 96, 392) - STACKED_PRACTICE_CARD_EDGE_INSET * 2);
  // const canSignInWithGoogle = hasAcceptedPolicy && (__DEV__ || Boolean(authConfig?.policy_url)) && !isLoadingAuthConfig;
  const canSignInWithGoogle = true;
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

        if (storedSessionToken) {
          const syncedPractices = await fetchRITAMMandalas(storedSessionToken);
          setPractices(syncedPractices);
          await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(syncedPractices));
        }
      } catch (error) {
        setErrorMessage('Could not load your mandala. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSavedData();
  }, []);

  // useEffect(() => {
  //   async function loadAuthConfig() {
  //     try {
  //       const config = await fetchRITAMAuthConfig();
  //       setAuthConfig(config);
  //     } catch {
  //       setGoogleSignInMessage('Could not load RITAM fine print. Please try again.');
  //     } finally {
  //       setIsLoadingAuthConfig(false);
  //     }
  //   }

  //   loadAuthConfig();
  // }, []);

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
    if(!canSignInWithGoogle) {
      setGoogleSignInMessage('Please read and agree to the fine print before continuing.');
      return;
    }

    setErrorMessage('');
    setIsGoogleSigningIn(true);
    setGoogleSignInMessage('Starting Google sign-in...');

    try {
      const googleIdentity = await getGoogleIdentityToken();
      const session = await exchangeGoogleTokenWithRITAM(googleIdentity.idToken);
      const displayName = 
        googleIdentity.displayName ?? getSessionDisplayName(session) ?? 'RITAM student';

      const idToken = await getGoogleIdentityToken();

      await saveRITAMSessionToken(session.accessToken);
      const syncedPractices = await fetchRITAMMandalas(session.accessToken);
      setPractices(syncedPractices);
      await Promise.all([
        AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(syncedPractices)),
        AsyncStorage.setItem(USER_NAME_STORAGE_KEY, displayName),
      ]);
      setSavedName(displayName);
      setGoogleSignInMessage('Signed in. Practice sync can now use your RITAM session.')
    } catch (error) {
      setGoogleSignInMessage(
        error instanceof Error ? error.message : 'Could not start Google sign-in. Please try again.',
      );
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  async function openFinePrint() {
    if (!authConfig?.policy_url) {
      setGoogleSignInMessage('Fine print is not available yet. Please try again.');
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(authConfig.policy_url);
    } catch {
      setGoogleSignInMessage('Could not open the fine print. Please try again.');
    }
  }

  async function createPractice() {
    const trimmedPracticeName = practiceName.trim();
    
    if (!trimmedPracticeName) {
      return;
    }

    setIsSaving(true);
    setErrorMessage('');


    setIsSaving(true);
    setErrorMessage('');

    try {
      const sessionToken = await getStoredRITAMSessionToken();
      
      if (sessionToken) {
        await createRITAMMandala(sessionToken, trimmedPracticeName);

        const syncedPractices = await fetchRITAMMandalas(sessionToken);
        await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(syncedPractices));
        setPractices(syncedPractices);
      } else {
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

        await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
        setPractices(nextPractices);
      }
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

    setIsSaving(true);
    setErrorMessage('');

    try {
      const sessionToken = await getStoredRITAMSessionToken();

      if(sessionToken) {
        await checkInRITAMMandala(sessionToken, practice.id);

        const syncedPractices = await fetchRITAMMandalas(sessionToken);
        await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(syncedPractices));
        setPractices(syncedPractices);
      } else {
        const nextPractices = practices.map((item) => 
          item.id === practiceId
            ? {
              ...item,
              daysCompleted: Math.min(item.daysCompleted + 1, item.durationDays),
              lastCompletedAt: today,
            }
            : item,
          );

        await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
        setPractices(nextPractices);
      }
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
    const practice = practices.find((item) => item.id === practiceId);

    if(!practice) {
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    
    try {
      const sessionToken = await getStoredRITAMSessionToken();

      if (sessionToken){
        await endRITAMMandala(sessionToken, practice.id);
      }

      const nextPractices = practices.filter((item) => item.id !== practiceId);

      await AsyncStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(nextPractices));
      setPractices(nextPractices);
      setPendingDeletePracticeId(null);
    } catch (error) {
      setErrorMessage('Could not delete your practice. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    setIsSaving(true);
    setErrorMessage('');

    try {
      await Promise.all([
        clearRITAMSessionToken(),
        AsyncStorage.removeItem(USER_NAME_STORAGE_KEY),
        AsyncStorage.removeItem(PRACTICES_STORAGE_KEY),
        signOutFromGoogle().catch(() => undefined),
      ]);

      setName('');
      setSavedName(null);
      setPracticeName('');
      setPractices([]);
      setIsCreatingPractice(false);
      setPendingDeletePracticeId(null);
      setHasAcceptedPolicy(false);
      setGoogleSignInMessage('');
    } catch {
      setErrorMessage('Could not log out. Please try again.');
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

            <Pressable
              accessibilityRole='button'
              disabled={isSaving}
              onPress={logout}
              style={({ pressed }) => [
                styles.logoutButton,
                isSaving && styles.primaryButtonDisabled,
                pressed && !isSaving && styles.pressed,
              ]}
            >
              <Text style={styles.logoutButtonText}>Log out</Text>
            </Pressable>            
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
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Existing practices</Text>
                <Text style={styles.sectionSubtitle}>
                  Your mandalas will appear here as flowers in your garden.
                </Text>
            </View>

            <View style={styles.layoutToggle}>
              <Pressable
                accessibilityRole='button'
                accessibilityState={{ selected: practiceLayout === 'list' }}
                onPress={() => setPracticeLayout('list')}
                style={({ pressed }) => [
                  styles.layoutToggleButton,
                  practiceLayout === 'list' && styles.layoutToggleButtonActive,
                  pressed && styles.pressed
                ]}
              >
                <Text
                  style={[
                    styles.layoutToggleText,
                    practiceLayout === 'list' && styles.layoutToggleTextActive,
                  ]}
                >
                  List
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole='button'
                accessibilityState={{ selected: practiceLayout === 'stack' }}
                onPress={() => setPracticeLayout('stack')}
                style={({ pressed }) => [
                  styles.layoutToggleButton,
                  practiceLayout === 'stack' && styles.layoutToggleButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.layoutToggleText,
                    practiceLayout === 'stack' && styles.layoutToggleTextActive,
                  ]}
                >
                  Stack
                </Text>
              </Pressable>
              </View>
            </View>

            {practices.length === 0 ? (
              <View style={styles.emptyGarden}>
                <Text style={styles.emptyGardenFlower}>🌱</Text>
                <Text style={styles.helperText}>Your garden is empty. Start a practice to see it bloom here.</Text>
              </View>
            ) : practiceLayout === 'stack' ? (
              <ScrollView 
                contentContainerStyle={styles.stackedPracticeTrack}
                decelerationRate="fast"
                directionalLockEnabled
                disableIntervalMomentum
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToAlignment='start'
                snapToInterval={stackedPracticeCardWidth + STACKED_PRACTICE_CARD_GAP}
                style={styles.stackedPracticeScroller}
              >
                {practices.map((practice, index) => (
                  <StackedPracticeCard 
                    key={practice.id}
                    cardWidth={stackedPracticeCardWidth}
                    index={index}
                    isSaving={isSaving}
                    onCompleteToday={completePracticeToday}
                    onDelete={confirmDeletePractice}
                    practice={practice}
                  />
                ))}
              </ScrollView>
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

          {/* <Pressable
            accessibilityRole='checkbox'
            accessibilityState={{ checked: hasAcceptedPolicy, disabled: isLoadingAuthConfig }}
            disabled={isLoadingAuthConfig}
            onPress={() => setHasAcceptedPolicy((accepted) => !accepted)}
            style={({ pressed }) => [
              styles.consentRow,
              isLoadingAuthConfig && styles.consentRowDisabled,
              pressed && !isLoadingAuthConfig && styles.pressed,
            ]}
          >
            <View style={[styles.checkbox, hasAcceptedPolicy && styles.checkboxChecked]}>
              {hasAcceptedPolicy ? <Text style={styles.checkboxMark}>{'\u2713'}</Text> : null}
            </View>

            <Text style={styles.consentLink}>
              {isLoadingAuthConfig ? 'Loading fine print...' : 'I have read and agreed to the '}
              {!isLoadingAuthConfig ? (
                <Text
                  accessibilityRole='link'
                  onPress={(event) => {
                    event.stopPropagation();
                    void openFinePrint();
                  }}
                  style={styles.consentLink}
                >
                  fine print
                </Text>
              ) : null}
              {!isLoadingAuthConfig ? '.' : null}
            </Text>
          </Pressable> */}

          {authConfig?.policy_version ? (
            <Text style={styles.policyVersionText}>Fine print version {authConfig.policy_version}</Text>
          ) : null}

          <Pressable
            accessibilityHint='Start Google sign-in for syncing your practices'
            accessibilityRole='button'
            disabled={isGoogleSigningIn || !canSignInWithGoogle}
            onPress={signInWithGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              (isGoogleSigningIn || !canSignInWithGoogle) && styles.primaryButtonDisabled,
              pressed && !isGoogleSigningIn && canSignInWithGoogle && styles.pressed
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

function getPracticeDisplayState(practice: Practice, isSaving: boolean) {
    const completedDays = Math.min(Math.max(practice.daysCompleted, 0), practice.durationDays);
    const progress = Math.round((practice.daysCompleted / practice.durationDays) * 100);
    const startedAt = practice.startedAt
      ? new Date(practice.startedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      : null;
    const isComplete = practice.daysCompleted >= practice.durationDays;
    const isCompletedToday = practice.lastCompletedAt === getLocalDateKey();
    const canCompleteToday = !isSaving && !isComplete && !isCompletedToday;
    const statusText = isComplete
      ? 'Mandala Complete'
      : isCompletedToday
        ? 'Completed today'
        : 'Tap to mark today complete';
    
    return { canCompleteToday, completedDays, isCompletedToday, startedAt, statusText };
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
  const { canCompleteToday, completedDays, isCompletedToday, startedAt, statusText } =
    getPracticeDisplayState(practice, isSaving);
  
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
          <MandalaBloom 
            completedDays={completedDays}
            durationDays={practice.durationDays}
            isCompletedToday={isCompletedToday}
          />

          <View style={styles.practiceDetails}>
            <Text style={styles.practiceName}>{practice.name}</Text>
            <Text style={styles.practiceMeta}>
              {startedAt ? `Started ${startedAt}` : 'Synced mandala'} {'\u00B7'} {practice.daysCompleted} of{' '}
              {practice.durationDays} days complete
            </Text>
            <Text style={styles.practiceStatus}>{statusText}</Text>
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

function StackedPracticeCard({
  cardWidth,
  index,
  isSaving,
  onCompleteToday,
  onDelete,
  practice,
}: {
  cardWidth: number;
  index: number;
  isSaving: boolean;
  onCompleteToday: (practiceId: string) => void;
  onDelete: (practiceId: string) => void;
  practice: Practice;
}) {
  const { canCompleteToday, completedDays, isCompletedToday, startedAt, statusText } =
    getPracticeDisplayState(practice, isSaving);
  
  return (
    <View
      accessibilityLabel={`${practice.name}, card ${index + 1}`}
      style={[styles.stackedPracticeCard, { width: cardWidth}]}
    >
      <View style={styles.stackedPracticeBloomFrame}>
        <MandalaBloom 
          completedDays={completedDays}
          durationDays={practice.durationDays}
          isCompletedToday={isCompletedToday}
          size={160}
        />
      </View>

      <Text style={styles.stackedPracticeName}>{practice.name}</Text>
      <Text style={styles.stackedPracticeMeta}>
        {startedAt ? `Started ${startedAt}` : 'Synced mandala'} {'\u00B7'} {practice.daysCompleted} of{' '}
        {practice.durationDays} days complete
      </Text>
      <Text style={styles.practiceStatus}>{statusText}</Text>

      <View style={styles.stackedActionRow}>
        <Pressable
          accessibilityHint={statusText}
          accessibilityRole='button'
          accessibilityState={{disabled: !canCompleteToday}}
          disabled={!canCompleteToday}
          onPress={() => onCompleteToday(practice.id)}
          style={({ pressed }) => [
            styles.primaryButton,
            styles.stackedActionButton,
            !canCompleteToday && styles.primaryButtonDisabled,
            pressed && canCompleteToday && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isCompletedToday ? 'Bloomed today' : 'Mark today complete'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityHint={`Delete ${practice.name}`}
          accessibilityRole='button'
          disabled={isSaving}
          onPress={() => onDelete(practice.id)}
          style={({ pressed }) => [
            styles.secondaryButton,
            styles.stackedDeleteButton,
            isSaving && styles.deleteButtonDisabled,
            pressed && !isSaving && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MandalaBloom({
  completedDays,
  durationDays,
  isCompletedToday,
  size = 96,
}: {
  completedDays: number;
  durationDays: number;
  isCompletedToday: boolean;
  size?: number;
}) {
  const bloomSize = size;
  const bloomCenter = bloomSize / 2;
  const centerSize = bloomSize * 0.33;
  const petalWidth = bloomSize * 0.0625;
  const petalHeight = bloomSize * 0.177;
  const petalRadius = bloomSize * 0.396;
  const centerTextSize = bloomSize * 0.1875;

  return (
    <View
      accessibilityLabel={`${completedDays} of ${durationDays} mandala petals bloomed`}
      accessibilityRole='image'
      style={styles.bloomWrap}
    >
      <View style={[styles.bloomFlower, { height: bloomSize, width: bloomSize }]}>
        {Array.from({ length: durationDays }, (_, index) => {
          const angleDegrees = (index * 360) / durationDays;
          const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
          const petalCenterX = bloomCenter + Math.cos(angleRadians) * petalRadius;
          const petalCenterY = bloomCenter + Math.sin(angleRadians) * petalRadius;
          const isBloomed = index < completedDays;
          const isToday = isCompletedToday && index === completedDays - 1;

          return (
            <View 
              key={index}
              style={[
                styles.bloomPetal,
                {
                  height: petalHeight,
                  left: petalCenterX - petalWidth / 2,
                  top: petalCenterY - petalHeight / 2,
                  transform: [{ rotate: `${angleDegrees}deg` }],
                  width: petalWidth,
                },
                isBloomed && styles.bloomPetalActive,
                isToday && styles.bloomPetalToday,
              ]}
            />
          );
        })}

        <View style={[
            styles.bloomCenter,
            {
              height: centerSize,
              left: bloomCenter - centerSize / 2,
              top: bloomCenter - centerSize / 2,
              width: centerSize,
            },
            ]}>
          <Text style={[styles.bloomCenterText, { fontSize: centerTextSize, lineHeight: centerTextSize + 4 }]}>{'\u273B'}</Text>
        </View>

      </View>
    </View>
  )
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
  logoutButton: {
    alignItems: 'center',
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: theme.marigoldDeep,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 18,
    textTransform: 'uppercase'
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
  consentRow: {
    alignItems: 'flex-start',
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  consentRowDisabled: {
    opacity: 0.6,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: theme.rule,
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: theme.peacock,
    borderColor: theme.peacock,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  consentText: {
    color: theme.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  consentLink: {
    color: theme.peacock,
    fontWeight: '800',
    textDecorationLine: 'underline'
  },
  policyVersionText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: -8,
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
  sectionHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 220,
  },
  layoutToggle: {
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  layoutToggleButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  layoutToggleButtonActive: {
    backgroundColor: theme.peacock,
  },
  layoutToggleText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  layoutToggleTextActive: {
    color: '#FFFFFF',
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
  stackedPracticeScroller: {
    paddingTop: 2,
    width: '100%',
  },
  stackedPracticeTrack: {
    gap: STACKED_PRACTICE_CARD_GAP,
    // paddingHorizontal: STACKED_PRACTICE_CARD_EDGE_INSET,
  },
  stackedPracticeList: {
    paddingTop: 2,
  },
  stackedPracticeCard: {
    alignItems: 'center',
    backgroundColor: theme.background,
    borderColor: theme.rule,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#4A2F15',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  stackedPracticeBloomFrame: {
    alignItems: 'center',
    backgroundColor: theme.backgroundElement,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    height: 184,
    justifyContent: 'center',
    width: 184,
  },
  stackedPracticeName: {
    color: theme.text,
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 27,
    fontWeight: '600',
    lineHeight: 34,
    textAlign: 'center',
  },
  stackedPracticeMeta: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  stackedActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    width: '100%',
  },
  stackedActionButton: {
    flex: 1,
    marginTop: 0,
  },
  stackedDeleteButton: {
    minHeight: 52,
    paddingHorizontal: 16,
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
  bloomWrap: {
    alignItems: 'flex-start',
    gap: 6,
  },
  bloomFlower: {
    height: 132,
    position: 'relative',
    width: 132,
  },
  bloomPetal: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    position: 'absolute',
  },
  bloomPetalActive: {
    backgroundColor: theme.marigold,
    borderColor: theme.marigoldDeep,
  },
  bloomPetalToday: {
    backgroundColor: theme.peacock,
    borderColor: theme.peacock,
  },
  bloomCenter: {
    alignItems: 'center',
    backgroundColor: theme.backgroundSelected,
    borderColor: theme.rule,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
  },
  bloomCenterText: {
    color: theme.marigoldDeep,
  },
  bloomCaption: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
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
