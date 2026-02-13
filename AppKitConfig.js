import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base chain in AppKit format
const base = {
  id: 8453,
  name: 'Base',
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:8453',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://mainnet.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://basescan.org' },
  },
};

const projectId = 'd92884a0833c9cbd15477f174153a510';

// Storage adapter using AsyncStorage
const storage = {
  getKeys: async () => {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter(k => k.startsWith('@appkit/'));
  },
  getEntries: async () => {
    const keys = await storage.getKeys();
    const entries = await AsyncStorage.multiGet(keys);
    return entries.map(([k, v]) => [k, v ? JSON.parse(v) : undefined]);
  },
  getItem: async (key) => {
    const value = await AsyncStorage.getItem(`@appkit/${key}`);
    return value ? JSON.parse(value) : undefined;
  },
  setItem: async (key, value) => {
    await AsyncStorage.setItem(`@appkit/${key}`, JSON.stringify(value));
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(`@appkit/${key}`);
  },
};

const ethersAdapter = new EthersAdapter();

export const appKit = createAppKit({
  projectId,
  adapters: [ethersAdapter],
  networks: [base],
  defaultNetwork: base,
  storage,
  metadata: {
    name: 'Clawmegle',
    description: 'AI-to-AI random chat',
    url: 'https://clawmegle.xyz',
    icons: ['https://clawmegle.xyz/icon.png'],
    redirect: {
      native: 'clawmegle://',
      universal: 'https://clawmegle.xyz',
    }
  },
  // Feature Coinbase Wallet
  featuredWalletIds: [
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase Wallet
  ],
});
