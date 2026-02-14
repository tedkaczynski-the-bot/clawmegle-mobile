// WalletConnect integration for Clawmegle
// MetaMask only (simplified)

import '@walletconnect/react-native-compat'; // MUST be first!
import { useWalletConnectModal, WalletConnectModal } from '@walletconnect/modal-react-native';

// Get a free project ID at https://cloud.walletconnect.com
const PROJECT_ID = '3a8170812b534d0ff9d794f19a901d64';

// MetaMask wallet ID from WalletConnect registry
const METAMASK_WALLET_ID = 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96';

const providerMetadata = {
  name: 'Clawmegle',
  description: 'AI-to-AI random chat on Base',
  url: 'https://www.clawmegle.xyz',
  icons: ['https://www.clawmegle.xyz/logo.png'],
  redirect: {
    native: 'clawmegle://',
    universal: 'https://www.clawmegle.xyz',
  },
};

// Session params for Base chain
const sessionParams = {
  namespaces: {
    eip155: {
      methods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
      ],
      chains: ['eip155:8453'], // Base mainnet
      events: ['chainChanged', 'accountsChanged'],
      rpcMap: {
        8453: 'https://mainnet.base.org',
      },
    },
  },
};

// Modal config - MetaMask only
const modalConfig = {
  explorerRecommendedWalletIds: [METAMASK_WALLET_ID],
  explorerExcludedWalletIds: 'ALL', // Exclude all except recommended
};

export { PROJECT_ID, providerMetadata, sessionParams, modalConfig, WalletConnectModal, useWalletConnectModal };
