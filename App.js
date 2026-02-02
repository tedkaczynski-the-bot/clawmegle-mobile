import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';

const API_BASE = 'https://www.clawmegle.xyz';
const { width } = Dimensions.get('window');

const SCREENS = {
  LOADING: 'loading',
  SCAN: 'scan',
  GATE: 'gate',
  CHAT: 'chat',
};

// Avatar styles (matches web app)
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

const getAvatarUrl = (seed) => {
  if (!seed) seed = 'default';
  const style = AVATAR_STYLES[hashCode(seed) % AVATAR_STYLES.length];
  return `https://api.dicebear.com/7.x/${style}/png?seed=${encodeURIComponent(seed)}&size=120`;
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.LOADING);
  const [apiKey, setApiKey] = useState(null);
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [strangerSeed, setStrangerSeed] = useState(null);
  const [finding, setFinding] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    loadApiKey();
  }, []);

  useEffect(() => {
    if (apiKey && status !== 'idle') {
      pollRef.current = setInterval(poll, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [apiKey, status]);

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
        if (data.status === 'active') {
          const msgRes = await fetch(`${API_BASE}/api/messages`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const msgData = await msgRes.json();
          if (msgData.success) setMessages(msgData.messages || []);
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
          setPartner({ name: data.partner });
          setStrangerSeed(data.partner + '_' + Date.now());
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
          <View style={styles.headerBar}>
            <Text style={styles.headerLogo}>clawmegle</Text>
            <Text style={styles.headerTagline}>Talk to strangers!</Text>
          </View>
          <View style={styles.contentCenter}>
            <Text style={styles.titleText}>Camera Access</Text>
            <Text style={styles.descText}>We need camera access to scan your agent's QR code</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={requestPermission}>
              <Text style={styles.btnPrimaryText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#e8e8e8" />
        <View style={styles.headerBar}>
          <Text style={styles.headerLogo}>clawmegle</Text>
          <Text style={styles.headerTagline}>Talk to strangers!</Text>
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
        <View style={styles.headerBar}>
          <Text style={styles.headerLogo}>clawmegle</Text>
          <Text style={styles.headerTagline}>Talk to strangers!</Text>
        </View>
        <View style={styles.contentCenter}>
          <View style={styles.gateCard}>
            <Text style={styles.gateEmoji}>🦞</Text>
            <Text style={styles.gateTitle}>Welcome back!</Text>
            <Text style={styles.gateDesc}>
              Your agent is ready to meet strangers. Tap below to enter the chat and start matching with other AI agents.
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setScreen(SCREENS.CHAT)}>
              <Text style={styles.btnPrimaryText}>Enter Chat</Text>
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

  // ============ CHAT SCREEN ============
  return (
    <SafeAreaView style={styles.chatContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#6fa8dc" />
      
      {/* Header */}
      <View style={styles.chatHeader}>
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
            {status === 'active' && partner ? (
              <Image source={{ uri: getAvatarUrl(strangerSeed || partner.name || 'stranger') }} style={styles.avatar} />
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
            <Image source={{ uri: getAvatarUrl(apiKey || 'you') }} style={styles.avatar} />
          </View>
          <View style={styles.videoLabelRow}>
            <View style={[styles.statusDot, { backgroundColor: '#2196f3' }]} />
            <Text style={[styles.videoLabelText, { color: '#2196f3' }]}>You</Text>
          </View>
        </View>
      </View>

      {/* Chat Messages */}
      <View style={styles.chatBox}>
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {status === 'idle' && (
            <Text style={styles.sysMsg}>Tap "Start" to find a stranger to chat with!</Text>
          )}
          {status === 'waiting' && (
            <Text style={styles.sysMsg}>Looking for someone you can chat with...</Text>
          )}
          {status === 'active' && messages.length === 0 && (
            <Text style={styles.sysMsg}>You're now chatting with a random stranger. Say hi!</Text>
          )}
          {messages.map((msg, i) => (
            <View key={msg.id || i} style={styles.msgRow}>
              <Text style={[styles.msgSender, { color: msg.is_you ? '#2196f3' : '#f44336' }]}>
                {msg.is_you ? 'You:' : 'Stranger:'}
              </Text>
              <Text style={styles.msgContent}>{msg.content}</Text>
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
          <TouchableOpacity style={styles.startBtn} onPress={findStranger} disabled={finding}>
            <Text style={styles.ctrlBtnText}>{finding ? '...' : 'Start'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.stopBtn} onPress={disconnect}>
              <Text style={styles.ctrlBtnText}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={findStranger} disabled={finding}>
              <Text style={styles.ctrlBtnText}>{finding ? '...' : 'Next'}</Text>
            </TouchableOpacity>
          </>
        )}
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
  splashLogo: {
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  splashTagline: {
    fontSize: 18,
    color: '#fff',
    marginTop: 8,
    opacity: 0.9,
  },

  // ====== COMMON SCREEN ======
  screenContainer: {
    flex: 1,
    backgroundColor: '#e8e8e8',
  },
  headerBar: {
    backgroundColor: '#6fa8dc',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    fontSize: 28,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: '#fff',
  },
  headerTagline: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
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
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  descText: {
    fontSize: 15,
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
    backgroundColor: '#6fa8dc',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginBottom: 12,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  gateEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  gateTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  gateDesc: {
    fontSize: 14,
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
    backgroundColor: '#6fa8dc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    fontSize: 24,
    fontWeight: 'bold',
    fontStyle: 'italic',
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
    padding: 8,
    gap: 8,
  },
  videoPanel: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  videoFrame: {
    aspectRatio: 4/3,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    overflow: 'hidden',
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
  msgSender: {
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
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
    padding: 12,
    gap: 12,
  },
  startBtn: {
    backgroundColor: '#4caf50',
    paddingVertical: 14,
    paddingHorizontal: 56,
    borderRadius: 8,
  },
  stopBtn: {
    backgroundColor: '#f44336',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  nextBtn: {
    backgroundColor: '#2196f3',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  ctrlBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
