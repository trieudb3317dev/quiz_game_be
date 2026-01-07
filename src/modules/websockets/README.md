# WebSocket Module - Real-time Wallet Balance Tracking

Module WebSocket để theo dõi số dư ví Solana theo thời gian thực với cập nhật giá token tự động.

## 🚀 Tính năng

- **Real-time Balance Tracking**: Theo dõi số dư SOL và SPL tokens theo thời gian thực
- **Multi-source Price Updates**: Lấy giá từ Raydium, CoinGecko, và DexScreener
- **Automatic Price Caching**: Cache giá 10 giây để tối ưu performance
- **WebSocket Connection Management**: Quản lý kết nối client tự động
- **Error Handling & Retry**: Xử lý lỗi và retry mechanism cho RPC calls

## 📁 Cấu trúc

```
websockets/
├── wallet-balance.gateway.ts    # WebSocket Gateway chính
├── websocket.module.ts          # Module configuration
└── README.md                    # Documentation
```

## 🔧 Cài đặt

### Dependencies

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io
npm install @solana/web3.js @solana/spl-token
npm install axios
```

### Environment Variables

```env
SOLANA_RPC_URL=https://your-rpc-url.com
SOLANA_WSS_URL=wss://your-wss-url.com
```

## 🎯 Sử dụng

### 1. React Hook (Recommended)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export const useWsWalletBalance = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [priceData, setPriceData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Connect to WebSocket
  const connect = useCallback(() => {
    const newSocket = io('http://localhost:8000', {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
      setError(null);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setIsConnected(false);
    });

    newSocket.on('balanceUpdate', (data) => {
      console.log('Balance update:', data);
      setBalanceData(data);
    });

    newSocket.on('priceUpdate', (data) => {
      console.log('Price update:', data);
      setPriceData(data);
    });

    newSocket.on('error', (err) => {
      console.error('WebSocket error:', err);
      setError(err.message);
    });

    setSocket(newSocket);
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  // Subscribe to balance updates
  const subscribeBalance = useCallback((walletAddress: string, tokenMints: string[] = []) => {
    if (socket && isConnected) {
      socket.emit('subscribeBalance', {
        walletAddress,
        tokenMints,
      });
    }
  }, [socket, isConnected]);

  // Subscribe to price updates
  const subscribePrice = useCallback((tokenMints: string[] = []) => {
    if (socket && isConnected) {
      socket.emit('subscribePrice', {
        tokenMints,
      });
    }
  }, [socket, isConnected]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    socket,
    isConnected,
    balanceData,
    priceData,
    error,
    connect,
    disconnect,
    subscribeBalance,
    subscribePrice,
  };
};
```

### 2. Sử dụng Hook trong Component

```typescript
import React from 'react';
import { useWsWalletBalance } from './hooks/useWsWalletBalance';

const WalletBalanceComponent = () => {
  const {
    isConnected,
    balanceData,
    priceData,
    error,
    subscribeBalance,
    subscribePrice
  } = useWsWalletBalance();

  const handleSubscribeBalance = () => {
    subscribeBalance('EbMmX3wPCGQvpaLfFLHAKtPn9T9JjrHc1CdaxyJ5Ef6z', [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // BONK
    ]);
  };

  const handleSubscribePrice = () => {
    subscribePrice([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // BONK
    ]);
  };

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {error && <p>Error: {error}</p>}
      
      {balanceData && (
        <div>
          <h3>Balance: ${balanceData.totalValueUSD?.toFixed(2)}</h3>
          <p>SOL: {balanceData.sol?.amount} (${balanceData.sol?.valueUSD?.toFixed(2)})</p>
        </div>
      )}
      
      {priceData && (
        <div>
          <h3>Prices:</h3>
          {Object.entries(priceData.prices).map(([token, price]) => (
            <p key={token}>{token}: ${price}</p>
          ))}
        </div>
      )}
      
      <button onClick={handleSubscribeBalance}>Subscribe Balance</button>
      <button onClick={handleSubscribePrice}>Subscribe Price</button>
    </div>
  );
};
```

### 3. Vanilla JavaScript

```javascript
const socket = io('ws://localhost:8000/balance', {
  transports: ['websocket', 'polling']
});

// Subscribe Balance
socket.emit('subscribeBalance', {
  walletAddress: 'EbMmX3wPCGQvpaLfFLHAKtPn9T9JjrHc1CdaxyJ5Ef6z',
  tokenMints: [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // BONK
  ]
});

// Listen to Events
socket.on('balanceUpdate', (data) => {
  console.log('Balance updated:', data);
  // {
  //   walletAddress: 'EbMmX3wPCGQvpaLfFLHAKtPn9T9JjrHc1CdaxyJ5Ef6z',
  //   sol: { amount: 0.5, priceUSD: 247.50, valueUSD: 123.75 },
  //   'EPjFWdd5...': { amount: 100, priceUSD: 1.0, valueUSD: 100 },
  //   totalValueUSD: 223.75
  // }
});

socket.on('priceUpdate', (data) => {
  console.log('Price updated:', data);
  // {
  //   walletAddress: 'EbMmX3wPCGQvpaLfFLHAKtPn9T9JjrHc1CdaxyJ5Ef6z',
  //   prices: {
  //     'So11111111111111111111111111111111111111112': 247.50, // SOL
  //     'EPjFWdd5...': 1.0, // USDC
  //     'DezXAZ8z...': 0.00043 // BONK
  //   },
  //   timestamp: 1758248280660
  // }
});
```

## 📊 API Events

### Client → Server

| Event | Payload | Mô tả |
|-------|---------|-------|
| `subscribeBalance` | `{ walletAddress: string, tokenMints?: string[] }` | Đăng ký theo dõi số dư ví |

### Server → Client

| Event | Payload | Mô tả |
|-------|---------|-------|
| `balanceUpdate` | `{ walletAddress: string, sol: {...}, [tokenMint]: {...}, totalValueUSD: number }` | Cập nhật số dư ví |
| `priceUpdate` | `{ walletAddress: string, prices: {...}, timestamp: number }` | Cập nhật giá token |

## ⚙️ Cấu hình

### WebSocket Gateway

```typescript
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  namespace: '/balance'
})
```

### Price Update Interval

- **Interval**: 10 giây
- **Cache Duration**: 10 giây
- **Sources**: Raydium → CoinGecko → DexScreener

### Supported Tokens

#### Hardcoded Mappings (CoinGecko)
- **SOL**: `So11111111111111111111111111111111111111112`
- **USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **USDT**: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- **BONK**: `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`
- **mSOL**: `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So`
- **ETH (Wormhole)**: `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs`

#### Dynamic Tokens
- Tất cả token mints mà client đăng ký
- Được fetch từ Raydium/DexScreener APIs

## 🔄 Luồng hoạt động

1. **Client kết nối** → WebSocket connection established
2. **Subscribe balance** → Client gửi `subscribeBalance` event
3. **Initial balance** → Server fetch và gửi số dư ban đầu
4. **Real-time tracking** → Subscribe Solana logs và token account changes
5. **Price updates** → Cập nhật giá mỗi 10 giây
6. **Balance updates** → Gửi cập nhật khi có thay đổi số dư
7. **Cleanup** → Tự động cleanup khi client disconnect

## 🛠️ Error Handling

- **RPC Retry**: 3 lần retry với exponential backoff
- **API Fallback**: Raydium → CoinGecko → DexScreener
- **Connection Cleanup**: Tự động cleanup disconnected clients
- **Rate Limiting**: Xử lý RPC rate limits

## 📈 Performance

- **Price Caching**: 10 giây cache để giảm API calls
- **Connection Pooling**: Quản lý WebSocket connections hiệu quả
- **Memory Management**: Tự động cleanup unused subscriptions
- **Error Recovery**: Graceful error handling và recovery

## 🔍 Debugging

### Logs
- Client connect/disconnect
- Balance updates
- Price updates
- Error messages

### Monitoring
- Active connections count
- Subscribed wallets count
- Price update frequency
- Error rates

## 🚨 Lưu ý

1. **RPC Limits**: Có thể gặp rate limit với RPC provider
2. **Memory Usage**: Monitor memory usage với nhiều connections
3. **API Limits**: Respect API rate limits của price sources
4. **Network**: Đảm bảo stable network connection

## 📝 Changelog

### v1.0.0
- Initial release
- Real-time balance tracking
- Multi-source price updates
- WebSocket connection management
- Error handling & retry mechanism
