// WalletConnect integration for Clawmegle
// Works with Coinbase Wallet, MetaMask, and other WalletConnect-compatible wallets

import '@walletconnect/react-native-compat'; // MUST be first!
import { useWalletConnectModal, WalletConnectModal } from '@walletconnect/modal-react-native';

// Get a free project ID at https://cloud.walletconnect.com
const PROJECT_ID = '3a8170812b534d0ff9d794f19a901d64';

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

export { PROJECT_ID, providerMetadata, sessionParams, WalletConnectModal, useWalletConnectModal };
