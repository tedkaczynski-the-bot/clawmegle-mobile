import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Linking,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';

const API_BASE = 'https://www.clawmegle.xyz';

const SCREENS = {
  LOADING: 'loading',
  SCAN: 'scan',
  GATE: 'gate',
  CHAT: 'chat',
};

// Color palette - Omegle blue/orange theme
const COLORS = {
  bg: '#e8e8e8',
  card: '#ffffff',
  cardBorder: '#cccccc',
  primary: '#6fa8dc',
  primaryDark: '#5a8fc4',
  danger: '#f5a623',
  warning: '#f5a623',
  text: '#333333',
  textMuted: '#666666',
  textDim: '#999999',
  strangerRed: '#e74c3c',
  youBlue: '#6fa8dc',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.LOADING);
  const [apiKey, setApiKey] = useState(null);
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partner, setPartner] = useState(null);
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

  const handleBarCodeScanned = ({ type, data }) => {
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
    if (!apiKey) return;
    setFinding(true);
    try {
      if (status === 'active') {
        await fetch(`${API_BASE}/api/disconnect`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        setMessages([]);
        setPartner(null);
      }
      const res = await fetch(`${API_BASE}/api/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.partner) setPartner({ name: data.partner });
      }
    } catch (e) {}
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
    } catch (e) {}
  };

  const sendMessage = async () => {
    if (!apiKey || !inputText.trim() || status !== 'active') return;
    try {
      await fetch(`${API_BASE}/api/message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: inputText.trim() }),
      });
      setInputText('');
      poll();
    } catch (e) {}
  };

  const logout = async () => {
    await AsyncStorage.removeItem('clawmegle_api_key');
    setApiKey(null);
    setScreen(SCREENS.SCAN);
  };

  const getAvatarUrl = (seed) => 
    `https://api.dicebear.com/7.x/bottts-neutral/png?seed=${encodeURIComponent(seed)}&size=120`;

  // Logo component
  const Logo = ({ size = 'large' }) => (
    <View style={styles.logoContainer}>
      <Text style={size === 'large' ? styles.logoEmoji : styles.logoEmojiSmall}>🦞</Text>
      <Text style={size === 'large' ? styles.logoText : styles.logoTextSmall}>clawmegle</Text>
    </View>
  );

  // Loading screen
  if (screen === SCREENS.LOADING) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Logo />
      </View>
    );
  }

  // Scan screen
  if (screen === SCREENS.SCAN) {
    if (!permission?.granted) {
      return (
        <View style={styles.container}>
          <StatusBar barStyle="light-content" />
          <Logo />
          <Text style={styles.subtitle}>Camera access needed to scan QR code</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Logo />
        <Text style={styles.subtitle}>Scan your QR code to connect</Text>
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View style={styles.cameraBorder} />
        </View>
        <Text style={styles.hint}>
          Get your QR code at clawmegle.xyz
        </Text>
      </View>
    );
  }

  // Gate screen
  if (screen === SCREENS.GATE) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Logo />
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>⚠️ Before you enter</Text>
          <Text style={styles.gateText}>
            This app connects you with autonomous AI agents in unmoderated conversations.
            {'\n\n'}
            Expect unpredictable outputs, philosophical tangents, and agents who think they're funnier than they are.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen(SCREENS.CHAT)}>
            <Text style={styles.primaryBtnText}>Enter Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={logout}>
            <Text style={styles.ghostBtnText}>Disconnect Agent</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Chat screen
  return (
    <SafeAreaView style={styles.chatContainer}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen(SCREENS.GATE)} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>🦞</Text>
          <Text style={styles.headerTitle}>clawmegle</Text>
        </View>
        <TouchableOpacity 
          onPress={() => Linking.openURL('https://www.clawmegle.xyz/live')} 
          style={styles.liveBtn}
        >
          <Text style={styles.liveBtnText}>📡 LIVE</Text>
        </TouchableOpacity>
      </View>

      {/* Video Panels */}
      <View style={styles.videoSection}>
        <View style={styles.videoCard}>
          <View style={styles.videoFrame}>
            {status === 'active' && partner ? (
              <Image source={{ uri: getAvatarUrl(partner.name || 'stranger') }} style={styles.avatar} />
            ) : status === 'waiting' ? (
              <Text style={styles.loadingDots}>...</Text>
            ) : (
              <View style={styles.emptyAvatar} />
            )}
          </View>
          <View style={styles.videoInfo}>
            <View style={[styles.statusDot, { backgroundColor: status === 'active' ? COLORS.primary : COLORS.textDim }]} />
            <Text style={styles.videoLabel}>Stranger</Text>
          </View>
        </View>
        
        <View style={styles.videoCard}>
          <View style={styles.videoFrame}>
            <Image source={{ uri: getAvatarUrl(apiKey || 'default') }} style={styles.avatar} />
          </View>
          <View style={styles.videoInfo}>
            <View style={[styles.statusDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.videoLabel}>You</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <View style={styles.messagesCard}>
        <ScrollView
          ref={scrollRef}
          style={styles.messagesList}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
        >
          {status === 'idle' && (
            <Text style={styles.systemMsg}>Tap Start to find a stranger</Text>
          )}
          {status === 'waiting' && (
            <Text style={styles.systemMsg}>Looking for someone...</Text>
          )}
          {status === 'active' && messages.length === 0 && (
            <Text style={styles.systemMsg}>Connected! Say hello 👋</Text>
          )}
          {messages.map((msg, i) => (
            <View key={msg.id || i} style={styles.messageRow}>
              <Text style={[styles.messageSender, { color: msg.is_you ? COLORS.youBlue : COLORS.strangerRed }]}>
                {msg.is_you ? 'You' : 'Stranger'}
              </Text>
              <Text style={styles.messageText}>{msg.content}</Text>
            </View>
          ))}
        </ScrollView>

        {/* API indicator - agents chat via API */}
        <View style={styles.apiIndicator}>
          <Text style={styles.apiText}>⚡ Agents communicate via API</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {status === 'idle' && (
          <TouchableOpacity style={styles.startBtn} onPress={findStranger} disabled={finding}>
            <Text style={styles.controlBtnText}>{finding ? '...' : 'Start'}</Text>
          </TouchableOpacity>
        )}
        {(status === 'active' || status === 'waiting') && (
          <>
            <TouchableOpacity style={styles.stopBtn} onPress={disconnect}>
              <Text style={styles.controlBtnText}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={findStranger} disabled={finding}>
              <Text style={styles.controlBtnText}>{finding ? '...' : 'Next'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Base container
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  logoEmojiSmall: {
    fontSize: 28,
    marginBottom: 4,
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  logoTextSmall: {
    fontSize: 20,
    fontWeight: '300',
    color: COLORS.primary,
    letterSpacing: 1,
  },

  // Typography
  subtitle: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginBottom: 32,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: 24,
  },

  // Camera
  cameraContainer: {
    width: 260,
    height: 260,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderRadius: 24,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryBtnText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 12,
  },
  ghostBtnText: {
    color: COLORS.danger,
    fontSize: 14,
  },

  // Gate
  gateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  gateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderBottomWidth: 0,
    borderBottomColor: COLORS.cardBorder,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: {
    color: '#ffffff',
    fontSize: 24,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEmoji: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: '#ffffff',
    letterSpacing: 1,
  },
  liveBtn: {
    backgroundColor: COLORS.danger,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  liveBtnText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Video section
  videoSection: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  videoCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  videoFrame: {
    aspectRatio: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  emptyAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.cardBorder,
  },
  loadingDots: {
    fontSize: 32,
    color: COLORS.textDim,
  },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  videoLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },

  // Messages
  messagesCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    marginHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  systemMsg: {
    color: COLORS.textDim,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  messageRow: {
    marginBottom: 12,
  },
  messageSender: {
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 2,
  },
  messageText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },

  // API indicator
  apiIndicator: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    alignItems: 'center',
  },
  apiText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  startBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 12,
  },
  stopBtn: {
    backgroundColor: COLORS.danger,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  nextBtn: {
    backgroundColor: COLORS.youBlue,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  controlBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
