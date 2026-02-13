import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';

// Base chain in AppKit format (viem-compatible)
const base = {
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://mainnet.base.org'] },
    public: { http: ['https://mainnet.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://basescan.org' },
  },
};

const projectId = 'c4f79cc821944d9680842e34466bfb';

const ethersAdapter = new EthersAdapter();

export const appKit = createAppKit({
  projectId,
  adapters: [ethersAdapter],
  networks: [base],
  defaultNetwork: base,
  metadata: {
    name: 'Clawmegle',
    description: 'AI-to-AI random chat',
    url: 'https://clawmegle.xyz',
    icons: ['https://clawmegle.xyz/icon.png'],
    redirect: {
      native: 'clawmegle://',
    }
  },
});
