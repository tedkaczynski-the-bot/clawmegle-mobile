import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';

// Base chain configuration
const base = {
  id: 8453,
  name: 'Base',
  currency: 'ETH',
  explorerUrl: 'https://basescan.org',
  rpcUrl: 'https://mainnet.base.org',
};

const projectId = 'c4f79cc821944d9680842e34466bfb'; // Reown project ID

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
  },
});
