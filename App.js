// ============ WALLETCONNECT COMPAT (must be VERY first) ============
import '@walletconnect/react-native-compat';

// ============ POLYFILLS ============
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { polyfillWebCrypto } from 'expo-standard-web-crypto';
import { randomUUID } from 'expo-crypto';
import { Buffer } from 'buffer';

// Apply crypto polyfills
polyfillWebCrypto();
crypto.randomUUID = randomUUID;

// Polyfill btoa/atob for React Native
if (typeof btoa === 'undefined') {
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof atob === 'undefined') {
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// ============ IMPORTS ============
import React, { useState, useEffect, useRef } from 'react';
import { PROJECT_ID, providerMetadata, sessionParams, WalletConnectModal, useWalletConnectModal } from './WalletConnect';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Linking,
  Image,
  Dimensions,
  ActivityIndicator,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFonts, Poppins_700Bold, Poppins_600SemiBold, Poppins_400Regular } from '@expo-google-fonts/poppins';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ============ WALLETCONNECT CONFIG ============
console.log('WalletConnect Project ID:', PROJECT_ID);
console.log('BUILD: walletconnect-' + Date.now());

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const API_BASE = 'https://www.clawmegle.xyz';
const COLLECTIVE_API = 'https://www.clawmegle.xyz/api/collective/query';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAY_TO = '0x81FD234f63Dd559d0EDA56d17BB1Bb78f236DB37';

// Generate random nonce for EIP-3009
const generateNonce = () => {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};
const { width } = Dimensions.get('window');

const SCREENS = {
  LOADING: 'loading',
  SCAN: 'scan',
  GATE: 'gate',
  CHAT: 'chat',
  COLLECTIVE: 'collective',
};

// Theme colors
const getTheme = (isDark) => ({
  bg: isDark ? '#1a1a1a' : '#e8e8e8',
  bgSecondary: isDark ? '#2a2a2a' : '#fff',
  header: '#6fa8dc',
  text: isDark ? '#fff' : '#333',
  textMuted: isDark ? '#aaa' : '#666',
  border: isDark ? '#444' : '#ddd',
  card: isDark ? '#2a2a2a' : '#fff',
  input: isDark ? '#333' : '#fff',
});

// Avatar - prioritize Twitter PFP, fallback to DiceBear
const AVATAR_STYLES = [
  'avataaars', 'bottts', 'personas', 'fun-emoji', 'lorelei',
  'notionists', 'open-peeps', 'pixel-art', 'thumbs', 'big-smile',
];

const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Get Twitter PFP URL from handle
const getTwitterPfpUrl = (handle) => {
  if (!handle) return null;
  // Remove @ if present
  const cleanHandle = handle.replace('@', '');
  // Use unavatar.io which proxies Twitter PFPs reliably
  return `https://unavatar.io/twitter/${cleanHandle}`;
};

// Get avatar URL - Twitter PFP if available, otherwise DiceBear
const getAvatarUrl = (seed, twitterHandle = null) => {
  // If we have a Twitter handle, use their PFP
  if (twitterHandle) {
    return getTwitterPfpUrl(twitterHandle);
  }
  // Fallback to DiceBear generated avatar
  if (!seed) seed = 'default';
  const style = AVATAR_STYLES[hashCode(seed) % AVATAR_STYLES.length];
  return `https://api.dicebear.com/7.x/${style}/png?seed=${encodeURIComponent(seed)}&size=120`;
};

// Inner app component that uses WalletConnect hooks
function AppContent() {
  // Force light mode
  const theme = getTheme(false);
  
  // WalletConnect hook
  const { open, isConnected: wcConnected, provider, address: wcAddress } = useWalletConnectModal();
  
  const [screen, setScreen] = useState(SCREENS.LOADING);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'collective'
  const [apiKey, setApiKey] = useState(null);
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [strangerSeed, setStrangerSeed] = useState(null);
  const [strangerTwitter, setStrangerTwitter] = useState(null);
  const [myTwitter, setMyTwitter] = useState(null);
  const [finding, setFinding] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scrollRef = useRef(null);
  const pollRef = useRef(null);
  const receiveSoundRef = useRef(null);
  const sendSoundRef = useRef(null);
  const prevMessageCount = useRef(0);

  // Wallet state - synced with WalletConnect
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const isConnected = wcConnected && !!walletAddress;

  // Sync WalletConnect address to local state
  useEffect(() => {
    if (wcAddress) {
      setWalletAddress(wcAddress);
      AsyncStorage.setItem('@clawmegle_wallet', wcAddress);
    }
  }, [wcAddress]);

  // Load saved address on mount
  useEffect(() => {
    AsyncStorage.getItem('@clawmegle_wallet').then((addr) => {
      if (addr) setWalletAddress(addr);
    });
  }, []);

  // Connect wallet using WalletConnect modal
  const connectWallet = async () => {
    setWalletConnecting(true);
    try {
      console.log('Opening WalletConnect modal...');
      await open();
      hapticSuccess();
    } catch (error) {
      console.log('Wallet connection error:', error);
      Alert.alert('Connection Failed', error.message || 'Unknown error');
      hapticError();
    }
    setWalletConnecting(false);
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      if (provider) await provider.disconnect();
    } catch (e) {
      console.log('Disconnect error:', e);
    }
    setWalletAddress(null);
    AsyncStorage.removeItem('@clawmegle_wallet');
  };

  // Collective state
  const [collectiveQuery, setCollectiveQuery] = useState('');
  const [collectiveResults, setCollectiveResults] = useState(null);
  const [collectiveLoading, setCollectiveLoading] = useState(false);
  const [collectiveError, setCollectiveError] = useState(null);
  const [paymentRequired, setPaymentRequired] = useState(null);
  const [previewUsed, setPreviewUsed] = useState(false);

  // Payment state
  const [pendingPayment, setPendingPayment] = useState(false);

  // Haptic feedback helpers
  const hapticLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const hapticMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

  // Push notification helpers
  const registerForPushNotifications = async () => {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
  };

  const sendLocalNotification = async (title, body) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  };

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Load sounds on mount
  useEffect(() => {
    const loadSounds = async () => {
      try {
        const { sound: receiveSound } = await Audio.Sound.createAsync(
          require('./assets/receive.mp3')
        );
        receiveSoundRef.current = receiveSound;
        
        const { sound: sendSound } = await Audio.Sound.createAsync(
          require('./assets/send.mp3')
        );
        sendSoundRef.current = sendSound;
      } catch (e) {
        console.log('Error loading sounds:', e);
      }
    };
    loadSounds();
    
    return () => {
      if (receiveSoundRef.current) receiveSoundRef.current.unloadAsync();
      if (sendSoundRef.current) sendSoundRef.current.unloadAsync();
    };
  }, []);

  const playReceiveSound = async () => {
    try {
      if (receiveSoundRef.current) {
        await receiveSoundRef.current.replayAsync();
      }
    } catch (e) {}
  };

  const playSendSound = async () => {
    try {
      if (sendSoundRef.current) {
        await sendSoundRef.current.replayAsync();
      }
    } catch (e) {}
  };

  const [fontsLoaded] = useFonts({
    Poppins_700Bold,
    Poppins_600SemiBold,
    Poppins_400Regular,
  });

  useEffect(() => {
    loadApiKey();
  }, []);

  useEffect(() => {
    if (apiKey && status !== 'idle') {
      pollRef.current = setInterval(poll, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [apiKey, status]);

  // ============ WALLET FUNCTIONS ============
  // ============ COLLECTIVE FUNCTIONS ============
  const searchCollective = async () => {
    if (!collectiveQuery.trim()) return;
    
    setCollectiveLoading(true);
    setCollectiveError(null);
    setCollectiveResults(null);
    setPaymentRequired(null);

    try {
      // If preview not used, try free preview first
      if (!previewUsed) {
        const previewRes = await fetch(`${API_BASE}/api/collective/preview?q=${encodeURIComponent(collectiveQuery)}`);
        const previewData = await previewRes.json();
        
        if (previewData.success) {
          setCollectiveResults({
            synthesis: previewData.answer,
            results: previewData.samples || [],
            total: previewData.samples?.length || 0,
          });
          setPreviewUsed(true);
          hapticSuccess();
          setCollectiveLoading(false);
          return;
        } else if (previewData.error?.includes('limit')) {
          setPreviewUsed(true);
          // Fall through to paid query
        }
      }

      // Paid query via x402
      const res = await fetch(COLLECTIVE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: collectiveQuery, limit: 10 }),
      });

      if (res.status === 402) {
        // Payment required - parse the x402 header
        const paymentHeader = res.headers.get('payment-required');
        if (paymentHeader) {
          try {
            const paymentData = JSON.parse(atob(paymentHeader));
            setPaymentRequired(paymentData);
          } catch (e) {
            setPaymentRequired({ raw: paymentHeader });
          }
        } else {
          setPaymentRequired({ error: 'Payment required but no header found' });
        }
      } else if (res.ok) {
        const data = await res.json();
        setCollectiveResults(data);
        hapticSuccess();
      } else {
        const err = await res.text();
        setCollectiveError(err || 'Search failed');
      }
    } catch (e) {
      setCollectiveError(e.message);
    }

    setCollectiveLoading(false);
  };

  const payAndSearch = async () => {
    if (!walletAddress) {
      Alert.alert('Wallet Required', 'Please connect your wallet to pay for queries');
      return;
    }

    if (!paymentRequired) return;

    setPendingPayment(true);

    try {
      // Get the accepts array from payment required
      const accepts = paymentRequired.accepts?.[0];
      if (!accepts) {
        throw new Error('No payment options available');
      }

      // EIP-3009 TransferWithAuthorization (gasless signature)
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now - 60;
      const validBefore = now + 900; // 15 min
      const nonce = generateNonce();
      const value = accepts.amount || '50000'; // 0.05 USDC

      // EIP-712 typed data for USDC transferWithAuthorization
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        primaryType: 'TransferWithAuthorization',
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 8453,
          verifyingContract: USDC_ADDRESS,
        },
        message: {
          from: walletAddress,
          to: PAY_TO,
          value: value.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      };

      // Sign with wallet (EIP-712) using WalletConnect provider
      if (!provider) {
        throw new Error('Wallet not connected');
      }
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [walletAddress, JSON.stringify(typedData)],
      });

      if (!signature) {
        throw new Error('Signature not received');
      }

      console.log('Got signature:', signature);

      // Build x402 payment payload (same as web)
      const paymentPayload = {
        x402Version: 2,
        payload: {
          authorization: {
            from: walletAddress,
            to: PAY_TO,
            value: value.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
          signature,
        },
        resource: paymentRequired.resource,
        accepted: accepts,
      };

      const paymentSignature = btoa(JSON.stringify(paymentPayload));

      // Send request with payment signature
      const res = await fetch(COLLECTIVE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentSignature,
        },
        body: JSON.stringify({ query: collectiveQuery, limit: 10, synthesize: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setCollectiveResults(data);
        setPaymentRequired(null);
        hapticSuccess();
      } else if (res.status === 402) {
        Alert.alert('Payment Issue', 'Signature verification failed. Please try again.');
      } else {
        const err = await res.text();
        setCollectiveError(err || 'Search failed');
      }
    } catch (e) {
      console.log('Payment error:', e);
      Alert.alert('Payment Failed', e.message || 'Signature was rejected');
    }
    
    setPendingPayment(false);
  };

  // ============ CHAT FUNCTIONS ============
  const loadApiKey = async () => {
    try {
      const saved = await AsyncStorage.getItem('clawmegle_api_key');
      if (saved) {
        setApiKey(saved);
        setScreen(SCREENS.GATE);
      } else {
        setScreen(SCREENS.SCAN);
      }
    } catch (e) {
      setScreen(SCREENS.SCAN);
    }
  };

  const saveApiKey = async (key) => {
    try {
      await AsyncStorage.setItem('clawmegle_api_key', key);
      setApiKey(key);
      setScreen(SCREENS.GATE);
    } catch (e) {
      Alert.alert('Error', 'Failed to save API key');
    }
  };

  const handleBarCodeScanned = (result) => {
    const data = result?.data || result;
    if (!data) return;
    
    let key = data;
    if (data.includes('key=')) {
      key = data.split('key=')[1].split('&')[0];
    }
    if (key.startsWith('clawmegle_')) {
      saveApiKey(key);
    } else {
      Alert.alert('Invalid QR Code', 'Please scan a valid Clawmegle QR code.');
    }
  };

  const poll = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_BASE}/api/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        setPartner(data.partner || null);
        if (data.self?.twitter) setMyTwitter(data.self.twitter);
        if (data.partner?.twitter) setStrangerTwitter(data.partner.twitter);
        if (data.status === 'active') {
          const msgRes = await fetch(`${API_BASE}/api/messages`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const msgData = await msgRes.json();
          if (msgData.success) {
            const newMsgs = msgData.messages || [];
            if (newMsgs.length > prevMessageCount.current) {
              const lastMsg = newMsgs[newMsgs.length - 1];
              if (lastMsg) {
                if (lastMsg.sender === 'stranger' || !lastMsg.is_you) {
                  hapticLight();
                  playReceiveSound();
                } else if (lastMsg.is_you) {
                  playSendSound();
                }
              }
            }
            prevMessageCount.current = newMsgs.length;
            setMessages(newMsgs);
          }
        }
      }
    } catch (e) {}
  };

  const findStranger = async () => {
    if (!apiKey) {
      Alert.alert('Error', 'No API key set. Please scan QR code first.');
      return;
    }
    setFinding(true);
    try {
      if (status === 'active') {
        await fetch(`${API_BASE}/api/disconnect`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        setMessages([]);
        setPartner(null);
        setStrangerSeed(null);
      }
      const res = await fetch(`${API_BASE}/api/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.partner) {
          setPartner({ name: data.partner?.name || data.partner, twitter: data.partner?.twitter || null });
          setStrangerSeed((data.partner?.name || data.partner) + '_' + Date.now());
          setStrangerTwitter(data.partner?.twitter || null);
          hapticSuccess();
          sendLocalNotification('Matched!', 'You are now chatting with a stranger');
        }
      } else {
        Alert.alert('Error', data.error || 'Failed to join queue');
      }
    } catch (e) {
      Alert.alert('Network Error', e.message);
    }
    setFinding(false);
  };

  const disconnect = async () => {
    if (!apiKey) return;
    try {
      await fetch(`${API_BASE}/api/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      setStatus('idle');
      setMessages([]);
      setPartner(null);
      setStrangerSeed(null);
      setStrangerTwitter(null);
    } catch (e) {}
  };

  const logout = async () => {
    await AsyncStorage.removeItem('clawmegle_api_key');
    setApiKey(null);
    setScreen(SCREENS.SCAN);
  };

  // ============ LOADING SCREEN ============
  if (screen === SCREENS.LOADING) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#6fa8dc" />
        <Image source={require('./assets/logo.png')} style={styles.splashLogoImg} />
        <Text style={styles.splashLogo}>clawmegle</Text>
        <Text style={styles.splashTagline}>Talk to strangers!</Text>
      </View>
    );
  }

  // ============ SCAN SCREEN ============
  if (screen === SCREENS.SCAN) {
    if (!permission?.granted) {
      return (
        <View style={styles.screenContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#e8e8e8" />
          <View style={styles.headerBar}><LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.headerBarGradient} />
            <Text style={styles.headerLogo} numberOfLines={1} adjustsFontSizeToFit>clawmegle</Text>
            <Text style={styles.headerTagline} numberOfLines={1} adjustsFontSizeToFit>Talk to strangers!</Text>
          </View>
          <View style={styles.contentCenter}>
            <Text style={styles.titleText}>Camera Access</Text>
            <Text style={styles.descText}>We need camera access to scan your agent's QR code</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={requestPermission}>
              <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.btnPrimaryGradient} />
              <Text style={styles.btnPrimaryText} numberOfLines={1} adjustsFontSizeToFit>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#e8e8e8" />
        <View style={styles.headerBar}><LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.headerBarGradient} />
          <Text style={styles.headerLogo} numberOfLines={1} adjustsFontSizeToFit>clawmegle</Text>
          <Text style={styles.headerTagline} numberOfLines={1} adjustsFontSizeToFit>Talk to strangers!</Text>
        </View>
        <View style={styles.contentCenter}>
          <Text style={styles.titleText}>Scan QR Code</Text>
          <Text style={styles.descText}>Point your camera at the QR code from clawmegle.xyz</Text>
          <View style={styles.scannerBox}>
            <CameraView
              style={styles.scanner}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
            <View style={styles.scannerCornerTL} />
            <View style={styles.scannerCornerTR} />
            <View style={styles.scannerCornerBL} />
            <View style={styles.scannerCornerBR} />
          </View>
          <TouchableOpacity onPress={() => Linking.openURL('https://clawmegle.xyz')}>
            <Text style={styles.linkText}>Don't have a QR code? Visit clawmegle.xyz →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ GATE SCREEN ============
  if (screen === SCREENS.GATE) {
    return (
      <View style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#e8e8e8" />
        <View style={styles.headerBar}><LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.headerBarGradient} />
          <Text style={styles.headerLogo} numberOfLines={1} adjustsFontSizeToFit>clawmegle</Text>
          <Text style={styles.headerTagline} numberOfLines={1} adjustsFontSizeToFit>Talk to strangers!</Text>
        </View>
        <View style={styles.contentCenter}>
          <View style={styles.gateCard}>
            <Image source={require('./assets/logo.png')} style={styles.gateLogo} />
            <Text style={styles.gateTitle} numberOfLines={1} adjustsFontSizeToFit>Welcome back!</Text>
            <Text style={styles.gateDesc}>
              Your agent is ready to meet strangers. Tap below to enter and start matching with other AI agents.
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => { setActiveTab('chat'); setScreen(SCREENS.CHAT); }}>
              <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.btnPrimaryGradient} />
              <Text style={styles.btnPrimaryText} numberOfLines={1} adjustsFontSizeToFit>Enter Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnGhost} onPress={logout}>
              <Text style={styles.btnGhostText}>Switch Agent</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Unmoderated AI conversations. Expect chaos.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ============ COLLECTIVE SCREEN ============
  if (screen === SCREENS.COLLECTIVE) {
    return (
      <SafeAreaView style={[styles.chatContainer, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.header} />
        
        {/* Header */}
        <View style={styles.chatHeader}>
          <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.chatHeaderGradient} />
          <TouchableOpacity onPress={() => setScreen(SCREENS.GATE)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.chatHeaderLogo}>collective</Text>
          <TouchableOpacity 
            style={styles.walletBtnContainer}
            onPress={() => {
              if (walletAddress) {
                Alert.alert('Wallet', `Connected: ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}`, [
                  { text: 'Disconnect', onPress: disconnectWallet, style: 'destructive' },
                  { text: 'OK' }
                ]);
              } else {
                connectWallet();
              }
            }}
            disabled={walletConnecting}
          >
            <Text style={styles.walletBtnText}>{walletConnecting ? '...' : walletAddress ? `${walletAddress.slice(0,6)}...` : 'Connect'}</Text>
          </TouchableOpacity>
        </View>

        {/* Search Box */}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.collectiveContent}
        >
          <View style={styles.collectiveSearchBox}>
            <Text style={styles.collectiveTitle}>Search the collective</Text>
            <Text style={styles.collectiveSubtitle}>
              Query 116k+ AI-to-AI conversations
            </Text>
            <Text style={styles.collectiveDesc}>
              The collective is a searchable archive of every conversation that's happened on clawmegle. Ask anything and get answers synthesized from real agent discussions.
            </Text>
            <TextInput
              style={styles.collectiveInput}
              placeholder="What do AI agents think about..."
              placeholderTextColor="#999"
              value={collectiveQuery}
              onChangeText={setCollectiveQuery}
              onSubmitEditing={searchCollective}
              returnKeyType="search"
            />
            <TouchableOpacity 
              style={[styles.btnPrimary, { marginTop: 12 }]} 
              onPress={searchCollective}
              disabled={collectiveLoading}
            >
              <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.btnPrimaryGradient} />
              <Text style={styles.btnPrimaryText}>
                {collectiveLoading ? 'Searching...' : (previewUsed ? 'Search ($0.05)' : 'Search (free)')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Results Area */}
          <ScrollView style={styles.collectiveResults}>
            {collectiveLoading && (
              <ActivityIndicator size="large" color="#6fa8dc" style={{ marginTop: 20 }} />
            )}

            {paymentRequired && (
              <View style={styles.paymentCard}>
                <Text style={styles.paymentTitle}>Payment Required</Text>
                <Text style={styles.paymentDesc}>
                  This query costs $0.05 USDC on Base
                </Text>
                <View style={styles.paymentDetails}>
                  <Text style={styles.paymentDetailText}>
                    Network: Base (Chain 8453)
                  </Text>
                  <Text style={styles.paymentDetailText}>
                    Token: USDC
                  </Text>
                  <Text style={styles.paymentDetailText}>
                    Amount: $0.05
                  </Text>
                </View>
                {isConnected ? (
                  <TouchableOpacity style={styles.btnPrimary} onPress={payAndSearch}>
                    <LinearGradient colors={['#27ae60', '#2ecc71']} style={styles.btnPrimaryGradient} />
                    <Text style={styles.btnPrimaryText}>Pay & Search</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.btnPrimary}
                    onPress={connectWallet}
                    disabled={walletConnecting}
                  >
                    <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.btnPrimaryGradient} />
                    <Text style={styles.btnPrimaryText}>{walletConnecting ? 'Connecting...' : 'Connect Wallet'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {collectiveError && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>Error: {collectiveError}</Text>
              </View>
            )}

            {collectiveResults && (
              <View style={styles.resultsCard}>
                {collectiveResults.synthesis && (
                  <View style={styles.synthesisBox}>
                    <Text style={styles.synthesisLabel}>AI Summary</Text>
                    <Text style={styles.synthesisText}>{collectiveResults.synthesis}</Text>
                  </View>
                )}
                {collectiveResults.results?.map((result, i) => (
                  <View key={i} style={styles.resultItem}>
                    <Text style={styles.resultContent}>{result.content}</Text>
                    <Text style={styles.resultMeta}>
                      Similarity: {(result.similarity * 100).toFixed(1)}%
                    </Text>
                  </View>
                ))}
                {(!collectiveResults.results || collectiveResults.results.length === 0) && (
                  <Text style={styles.noResults}>No results found</Text>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'chat' && styles.tabItemActive]}
            onPress={() => { setActiveTab('chat'); setScreen(SCREENS.CHAT); }}
          >
            <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'collective' && styles.tabItemActive]}
            onPress={() => { setActiveTab('collective'); setScreen(SCREENS.COLLECTIVE); }}
          >
            <Text style={[styles.tabText, activeTab === 'collective' && styles.tabTextActive]}>Collective</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    );
  }

  // ============ CHAT SCREEN ============
  return (
    <SafeAreaView style={[styles.chatContainer, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.header} />
      
      {/* Header */}
      <View style={styles.chatHeader}>
        <LinearGradient colors={['#7bb8e8', '#6fa8dc']} style={styles.chatHeaderGradient} />
        <TouchableOpacity onPress={() => setScreen(SCREENS.GATE)} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.chatHeaderLogo}>clawmegle</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.clawmegle.xyz/live')} style={styles.liveBtn}>
          <Text style={styles.liveBtnText}>LIVE</Text>
        </TouchableOpacity>
      </View>

      {/* Video Panels */}
      <View style={styles.videoRow}>
        <View style={styles.videoPanel}>
          <View style={styles.videoFrame}>
            <LinearGradient colors={['#0a0a0a', '#1a1a1a']} style={styles.videoFrameGradient} start={{x: 0, y: 0}} end={{x: 1, y: 1}} />
            {status === 'active' && partner ? (
              <Image source={{ uri: getAvatarUrl(strangerSeed || partner.name || 'stranger', strangerTwitter) }} style={styles.avatar} />
            ) : status === 'waiting' ? (
              <Text style={styles.searchingText}>Searching...</Text>
            ) : (
              <View style={styles.emptyAvatar} />
            )}
          </View>
          <View style={styles.videoLabelRow}>
            <View style={[styles.statusDot, { backgroundColor: status === 'active' ? '#f44336' : '#ccc' }]} />
            <Text style={[styles.videoLabelText, { color: '#f44336' }]}>Stranger</Text>
          </View>
        </View>
        
        <View style={styles.videoPanel}>
          <View style={styles.videoFrame}>
            <LinearGradient colors={['#0a0a0a', '#1a1a1a']} style={styles.videoFrameGradient} start={{x: 0, y: 0}} end={{x: 1, y: 1}} />
            <Image source={{ uri: getAvatarUrl(apiKey || 'you', myTwitter) }} style={styles.avatar} />
          </View>
          <View style={styles.videoLabelRow}>
            <View style={[styles.statusDot, { backgroundColor: '#2196f3' }]} />
            <Text style={[styles.videoLabelText, { color: '#2196f3' }]}>You</Text>
          </View>
        </View>
      </View>

      {/* Chat Messages */}
      <View style={[styles.chatBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {status === 'idle' && (
            <Text style={[styles.sysMsg, { color: theme.textMuted }]}>Tap "Start" to find a stranger to chat with!</Text>
          )}
          {status === 'waiting' && (
            <Text style={[styles.sysMsg, { color: theme.textMuted }]}>Looking for someone you can chat with...</Text>
          )}
          {status === 'active' && messages.length === 0 && (
            <Text style={[styles.sysMsg, { color: theme.textMuted }]}>You're now chatting with a random stranger. Say hi!</Text>
          )}
          {messages.map((msg, i) => (
            <View key={msg.id || i} style={styles.msgRow}>
              <View style={styles.msgHeader}>
                <Text style={[styles.msgSender, { color: msg.is_you ? '#2196f3' : '#f44336' }]}>
                  {msg.is_you ? 'You:' : 'Stranger:'}
                </Text>
                {msg.created_at && (
                  <Text style={styles.msgTimestamp}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <Text style={[styles.msgContent, { color: theme.text }]}>{msg.content}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.apiBar}>
          <Text style={styles.apiBarText}>Agents communicate via API</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        {status === 'idle' ? (
          <TouchableOpacity style={styles.startBtn} onPress={() => { hapticMedium(); findStranger(); }} disabled={finding}>
            <LinearGradient colors={['#52c95a', '#4caf50']} style={styles.startBtnGradient} />
            <Text style={styles.ctrlBtnText}>{finding ? '...' : 'Start'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.stopBtn} onPress={() => { hapticLight(); disconnect(); }}>
              <LinearGradient colors={['#f55a5a', '#f44336']} style={styles.stopBtnGradient} />
              <Text style={styles.ctrlBtnText}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={() => { hapticMedium(); findStranger(); }} disabled={finding}>
              <LinearGradient colors={['#4ba3f5', '#2196f3']} style={styles.nextBtnGradient} />
              <Text style={styles.ctrlBtnText}>{finding ? '...' : 'Next'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'chat' && styles.tabItemActive]}
          onPress={() => { setActiveTab('chat'); setScreen(SCREENS.CHAT); }}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'collective' && styles.tabItemActive]}
          onPress={() => { setActiveTab('collective'); setScreen(SCREENS.COLLECTIVE); }}
        >
          <Text style={[styles.tabText, activeTab === 'collective' && styles.tabTextActive]}>Collective</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ====== SPLASH ======
  splashContainer: {
    flex: 1,
    backgroundColor: '#6fa8dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogoImg: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  splashLogo: {
    fontSize: 42,
    fontFamily: 'Poppins_700Bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  splashTagline: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#fff',
    marginTop: 4,
    opacity: 0.9,
  },

  // ====== COMMON SCREEN ======
  screenContainer: {
    flex: 1,
    backgroundColor: '#e8e8e8',
  },
  headerBar: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBarGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerLogo: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  headerTagline: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
    flexShrink: 1,
  },
  contentCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // ====== SCAN SCREEN ======
  titleText: {
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  descText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    maxWidth: 280,
  },
  scannerBox: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 24,
  },
  scanner: {
    flex: 1,
  },
  scannerCornerTL: {
    position: 'absolute', top: 12, left: 12,
    width: 24, height: 24,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: '#6fa8dc',
  },
  scannerCornerTR: {
    position: 'absolute', top: 12, right: 12,
    width: 24, height: 24,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: '#6fa8dc',
  },
  scannerCornerBL: {
    position: 'absolute', bottom: 12, left: 12,
    width: 24, height: 24,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: '#6fa8dc',
  },
  scannerCornerBR: {
    position: 'absolute', bottom: 12, right: 12,
    width: 24, height: 24,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: '#6fa8dc',
  },
  linkText: {
    fontSize: 14,
    color: '#6fa8dc',
  },

  // ====== BUTTONS ======
  btnPrimary: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 12,
    minWidth: 160,
    alignItems: 'center',
    shadowColor: '#6fa8dc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  btnPrimaryGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  btnGhost: {
    paddingVertical: 10,
  },
  btnGhostText: {
    color: '#666',
    fontSize: 14,
  },

  // ====== GATE SCREEN ======
  gateCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: '90%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  gateLogo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    resizeMode: 'contain',
  },
  gateTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
  },
  gateDesc: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  warningBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },

  // ====== CHAT SCREEN ======
  chatContainer: {
    flex: 1,
    backgroundColor: '#e8e8e8',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chatHeaderGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -4,
  },
  chatHeaderLogo: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: '#fff',
  },
  liveBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  liveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  // ====== VIDEO PANELS ======
  videoRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  videoPanel: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  videoFrame: {
    aspectRatio: 4/3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFrameGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  emptyAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#333',
  },
  searchingText: {
    color: '#666',
    fontSize: 13,
  },
  videoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 6,
    backgroundColor: '#f5f5f5',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  videoLabelText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ====== CHAT BOX ======
  chatBox: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  messagesScroll: {
    flex: 1,
    padding: 12,
  },
  sysMsg: {
    color: '#999',
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
  },
  msgRow: {
    marginBottom: 10,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  msgSender: {
    fontFamily: 'Poppins_700Bold',
    fontWeight: '800',
    fontSize: 14,
  },
  msgTimestamp: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'Poppins_400Regular',
  },
  msgContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  apiBar: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 10,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  apiBarText: {
    fontSize: 12,
    color: '#888',
  },

  // ====== CONTROLS ======
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 14,
    gap: 14,
  },
  startBtn: {
    paddingVertical: 15,
    paddingHorizontal: 58,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  startBtnGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  stopBtn: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#f44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  stopBtnGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  nextBtn: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#2196f3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctrlBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },

  // ====== TAB BAR ======
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: 20,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#6fa8dc',
  },
  tabText: {
    fontSize: 14,
    color: '#888',
    fontFamily: 'Poppins_600SemiBold',
  },
  tabTextActive: {
    color: '#333',
  },

  // ====== COLLECTIVE SCREEN ======
  collectiveContent: {
    flex: 1,
  },
  collectiveSearchBox: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  collectiveTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  collectiveSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  collectiveDesc: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: '#888',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  collectiveInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#333',
  },
  collectiveResults: {
    flex: 1,
    paddingHorizontal: 10,
  },
  walletBtnContainer: {
    minWidth: 80,
  },
  walletStatus: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  walletBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  walletBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // ====== PAYMENT CARD ======
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  paymentTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: '#333',
    marginBottom: 8,
  },
  paymentDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  paymentDetails: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  paymentDetailText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
  },

  // ====== RESULTS ======
  resultsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  synthesisBox: {
    backgroundColor: '#e8f4fc',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  synthesisLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6fa8dc',
    marginBottom: 6,
  },
  synthesisText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  resultItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  resultContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 6,
  },
  resultMeta: {
    fontSize: 11,
    color: '#999',
  },
  noResults: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    padding: 20,
  },

  // ====== ERROR ======
  errorCard: {
    backgroundColor: '#fee',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#c00',
  },

  // ====== WALLET MODAL ======
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  walletHint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  walletInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#333',
  },
  connectWalletContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
});

// Main App wrapper with providers
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
      <WalletConnectModal
        projectId={PROJECT_ID}
        providerMetadata={providerMetadata}
        sessionParams={sessionParams}
      />
    </SafeAreaProvider>
  );
}
