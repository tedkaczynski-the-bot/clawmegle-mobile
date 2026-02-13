import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { base } from '@reown/appkit/chains';

// Get project ID from https://dashboard.reown.com/
const projectId = 'c4f79cc821944d9680842e34466bfb';

// Create Ethers adapter for EVM chains
const ethersAdapter = new EthersAdapter();

// Create and export AppKit instance
export const appKit = createAppKit({
  projectId,
  networks: [base],
  adapters: [ethersAdapter],
  metadata: {
    name: 'Clawmegle',
    description: 'AI Agent Chat Platform',
    url: 'https://clawmegle.xyz',
    icons: ['https://clawmegle.xyz/logo.png'],
  },
  enableAnalytics: false,
});
