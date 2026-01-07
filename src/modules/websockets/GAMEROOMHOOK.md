# Game Room WebSocket React Hook - Complete Integration Guide

## Overview
This document provides a comprehensive React hook for integrating with the Game Room WebSocket gateway in Next.js applications. The hook handles all WebSocket events, connection management, and provides a clean API for game room functionality with **real-time participants updates**, **session management**, and **high performance**. 

**Note**: This hook only handles sessions with status `pending`, `running`, and `end`. Sessions with `out` status are excluded from all operations.

## Installation

First, install the required dependencies:

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

## Hook Implementation

```typescript
// hooks/useGameRoomWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Constants (matching server-side enums)
export const GAME_ROOM_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  OUT: 'out',
  END: 'end',
  DELETE: 'delete',
} as const;

export const GAME_SESSION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  END: 'end',
} as const;

export const GAME_JOIN_ROOM_STATUS = {
  EXECUTED: 'executed',
  VIEW: 'view',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

// Types
export interface GameRoomInfo {
  id: number;
  name: string;
  symbol: string;
  game_type_id: number | null;
  owner_id: {
    id: number;
    username: string;
  } | null;
  current_session: {
    id: number;
    status: string;
    time_start: string;
    session: number;
  } | null;
}

export interface GameTypeCounts {
  pending: {
    count: number;
  };
  running: {
    count: number;
  };
  end: {
    count: number;
  };
  total: {
    count: number;
  };
  lastUpdated: string;
}

export interface GameRoomCounts {
  lottery: GameTypeCounts;
  rps: GameTypeCounts;
  total: GameTypeCounts;
  error?: string;
}

export interface CurrentSession {
  id: number;
  status: string;
  time_start: string;
  session: number;
  participants_count: number;
  max_participants: number;
  can_join: boolean;
}

export interface CurrentSessionSnapshot {
  roomId: number;
  current_session: CurrentSession | null;
}

export interface Participant {
  id: number;
  user_id: number | null;
  username: string | null;
  fullname: string | null;
  avatar: string | null;
  wallet_address: string;
  amount: number;
  time_join: string;
  status: string;
}

export interface RoomParticipants {
  success?: boolean;
  roomId: number;
  sessionId: number | null;
  sessionStatus?: string | null;
  participants: Participant[];
  totalCount: number;
  timestamp: string;
  error?: string;
}

export interface JoinRoomResult {
  success: boolean;
  roomId: number;
  message?: string;
  participants: Participant[];
  totalCount: number;
  sessionId: number | null;
  sessionStatus: string | null;
  timestamp: string;
  error?: string;
}

export interface ConnectionInfo {
  message: string;
  clientId: string;
  namespace: string;
  userId: number | null;
}

export interface UserActiveRoomResult {
  success: boolean;
  isInActiveRoom: boolean;
  currentRoom: {
    roomId: number;
    roomName: string;
    sessionId: number;
    sessionStatus: string;
    timeStart: string;
    isExpired: boolean;
  } | null;
  message?: string;
  error?: string;
}

export interface CheckJoinerInRoomResult {
  success: boolean;
  roomId: number;
  sessionId: number;
  isAlreadyInRoom: boolean;
  currentRoom: {
    roomId: number;
    roomName: string;
    sessionId: number;
    sessionStatus: string;
    timeStart: string;
  } | null;
  message?: string;
  error?: string;
}

export interface GameRoomWithJoiners {
  id: number;
  name: string;
  participation_amount: number;
  joiners_num: number;
  status: string;
  latest_session_id: number | null;
}

export interface GameRoomsListResponse {
  rooms: GameRoomWithJoiners[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}

export interface GameRoomsListUpdated {
  rooms: GameRoomWithJoiners[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  updatedRoomId: number;
  action: string;
  timestamp: string;
}


// Hook options
export interface UseGameRoomWebSocketOptions {
  serverUrl?: string;
  autoConnect?: boolean;
  onConnect?: (info: ConnectionInfo) => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

// Hook return type
export interface UseGameRoomWebSocketReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionInfo: ConnectionInfo | null;
  
  // Room counts
  roomCounts: GameRoomCounts | null;
  subscribeRoomCountByGameType: () => Promise<GameRoomCounts | null>;
  
  // Current session
  currentSession: CurrentSessionSnapshot | null;
  subscribeCurrentSession: (roomId: number) => void;
  
  // Room participants
  roomParticipants: RoomParticipants | null;
  joinRoom: (payload: { roomId: number, sessionId: number }) => Promise<JoinRoomResult | null>;
  leaveRoom: (payload: { roomId: number }) => void;
  getCurrentRoomParticipants: (payload: { roomId: number }) => Promise<RoomParticipants | null>;
  checkJoinerInRoom: (payload: { roomId: number, sessionId: number }) => Promise<CheckJoinerInRoomResult | null>;
  checkUserActiveRoom: () => Promise<UserActiveRoomResult | null>;
  
  // Game rooms list
  gameRoomsList: GameRoomsListResponse | null;
  getGameRoomsList: (query?: any) => Promise<GameRoomsListResponse | null>;
  
  // Connection management
  connect: () => void;
  disconnect: () => void;
  
  // Error handling
  error: string | null;
  clearError: () => void;
}

export const useGameRoomWebSocket = (
  options: UseGameRoomWebSocketOptions = {}
): UseGameRoomWebSocketReturn => {
  const {
    serverUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8008',
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [roomCounts, setRoomCounts] = useState<GameRoomCounts | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSessionSnapshot | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipants | null>(null);
  const [userActiveRoomStatus, setUserActiveRoomStatus] = useState<UserActiveRoomResult | null>(null);
  const [checkJoinerInRoomResult, setCheckJoinerInRoomResult] = useState<CheckJoinerInRoomResult | null>(null);
  const [gameRoomsList, setGameRoomsList] = useState<GameRoomsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const joinRoomPromiseRef = useRef<{
    resolve: (value: JoinRoomResult | null) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const getParticipantsPromiseRef = useRef<{
    resolve: (value: RoomParticipants | null) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const checkUserActiveRoomPromiseRef = useRef<{
    resolve: (value: UserActiveRoomResult | null) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const checkJoinerInRoomPromiseRef = useRef<{
    resolve: (value: CheckJoinerInRoomResult | null) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const getGameRoomsListPromiseRef = useRef<{
    resolve: (value: GameRoomsListResponse | null) => void;
    reject: (reason?: any) => void;
  } | null>(null);

  // Clear error helper
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const socket = io(`${serverUrl}/game-rooms`, {
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        autoConnect: false,
      });

      // Connection event handlers
      socket.on('connect', () => {
        console.log('🔌 Connected to game-rooms namespace:', socket.id);
        setIsConnected(true);
        setIsConnecting(false);
      });

      socket.on('disconnect', (reason) => {
        console.log('🔌 Disconnected from game-rooms:', reason);
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnect?.();
      });

      socket.on('connected', (info: ConnectionInfo) => {
        console.log('✅ Game room connection established:', info);
        setConnectionInfo(info);
        onConnect?.(info);
      });

      // Room counts events
      socket.on('gameRoomCounts', (counts: GameRoomCounts) => {
        console.log('📊 Room counts updated:', counts);
        setRoomCounts(counts);
      });

      // Current session events
      socket.on('currentSession', (snapshot: CurrentSessionSnapshot) => {
        console.log('🎮 Current session snapshot:', snapshot);
        setCurrentSession(snapshot);
      });

      socket.on('currentSessionUpdated', (snapshot: CurrentSessionSnapshot) => {
        console.log('🔄 Current session updated:', snapshot);
        setCurrentSession(snapshot);
      });

      // Room participants events
      socket.on('joinRoomResult', (result: JoinRoomResult) => {
        console.log('🚪 Join room result:', result);
        if (joinRoomPromiseRef.current) {
          joinRoomPromiseRef.current.resolve(result);
          joinRoomPromiseRef.current = null;
        }
      });

      socket.on('roomParticipantsUpdated', (data: RoomParticipants) => {
        console.log('👥 Room participants updated:', data);
        setRoomParticipants(data);
      });

      socket.on('currentRoomParticipantsResult', (data: RoomParticipants) => {
        console.log('👥 Current room participants result:', data);
        setRoomParticipants(data);
        
        // Resolve promise if waiting for response
        if (getParticipantsPromiseRef.current) {
          getParticipantsPromiseRef.current.resolve(data);
          getParticipantsPromiseRef.current = null;
        }
      });

      socket.on('userActiveRoomResult', (data: UserActiveRoomResult) => {
        console.log('👤 User active room result:', data);
        setUserActiveRoomStatus(data);
        
        // Resolve promise if waiting for response
        if (checkUserActiveRoomPromiseRef.current) {
          checkUserActiveRoomPromiseRef.current.resolve(data);
          checkUserActiveRoomPromiseRef.current = null;
        }
      });

      socket.on('checkJoinerInRoomResult', (data: CheckJoinerInRoomResult) => {
        console.log('🔍 Check joiner in room result:', data);
        setCheckJoinerInRoomResult(data);
        
        // Resolve promise if waiting for response
        if (checkJoinerInRoomPromiseRef.current) {
          checkJoinerInRoomPromiseRef.current.resolve(data);
          checkJoinerInRoomPromiseRef.current = null;
        }
      });

      // Game rooms list events
      socket.on('gameRoomsListResponse', (data: GameRoomsListResponse) => {
        console.log('📋 Game rooms list response:', data);
        setGameRoomsList(data);
        
        // Resolve promise if waiting for response
        if (getGameRoomsListPromiseRef.current) {
          getGameRoomsListPromiseRef.current.resolve(data);
          getGameRoomsListPromiseRef.current = null;
        }
      });

      socket.on('gameRoomsListUpdated', (data: GameRoomsListUpdated) => {
        console.log('🔄 Game rooms list updated:', data);
        setGameRoomsList({
          rooms: data.rooms,
          pagination: data.pagination,
          timestamp: data.timestamp
        });
      });

      socket.on('gameRoomsListError', (errorData: { error: string; timestamp: string }) => {
        console.error('❌ Game rooms list error:', errorData);
        setError(errorData.error);
        
        // Resolve promise with null if waiting for response
        if (getGameRoomsListPromiseRef.current) {
          getGameRoomsListPromiseRef.current.resolve(null);
          getGameRoomsListPromiseRef.current = null;
        }
      });


      // Error handling
      socket.on('error', (errorData: { message: string }) => {
        console.error('❌ WebSocket error:', errorData);
        const errorMessage = errorData.message || 'WebSocket connection error';
        setError(errorMessage);
        onError?.(errorMessage);
      });

      socket.on('connect_error', (err) => {
        console.error('❌ Connection error:', err);
        const errorMessage = err.message || 'Failed to connect to WebSocket';
        setError(errorMessage);
        onError?.(errorMessage);
        setIsConnecting(false);
      });

      socketRef.current = socket;
      socket.connect();
    } catch (err) {
      console.error('❌ Failed to create WebSocket connection:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create WebSocket connection';
      setError(errorMessage);
      onError?.(errorMessage);
      setIsConnecting(false);
    }
  }, [serverUrl, onConnect, onDisconnect, onError]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionInfo(null);
  }, []);

  // Subscribe to room counts with debouncing
  const subscribeRoomCountByGameType = useCallback((): Promise<GameRoomCounts | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot subscribe to room counts');
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      // Set up one-time listener for the response
      const handleResponse = (counts: GameRoomCounts) => {
        console.log('📊 Room counts received:', counts);
        setRoomCounts(counts);
        socketRef.current?.off('gameRoomCounts', handleResponse);
        resolve(counts);
      };

      socketRef.current?.on('gameRoomCounts', handleResponse);
      console.log('📊 Subscribing to room counts');
      socketRef.current?.emit('subscribeRoomCountByGameType');

      // Timeout after 5 seconds
      setTimeout(() => {
        socketRef.current?.off('gameRoomCounts', handleResponse);
        resolve(null);
      }, 5000);
    });
  }, []);

  // Debounced subscription to avoid multiple calls
  const debouncedSubscribeRoomCounts = useCallback(() => {
    const timeoutId = setTimeout(() => {
      subscribeRoomCountByGameType();
    }, 100); // 100ms debounce

    return () => clearTimeout(timeoutId);
  }, [subscribeRoomCountByGameType]);

  // Subscribe to current session
  const subscribeCurrentSession = useCallback((roomId: number) => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot subscribe to current session');
      return;
    }

    console.log('🎮 Subscribing to current session for room:', roomId);
    socketRef.current.emit('subscribeCurrentSession', roomId);
  }, []);

  // Join room and get participants
  const joinRoom = useCallback(async (payload: { roomId: number, sessionId: number }): Promise<JoinRoomResult | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot join room');
      return null;
    }

    return new Promise((resolve, reject) => {
      joinRoomPromiseRef.current = { resolve, reject };
      
      console.log('🚪 Joining room:', payload);
      socketRef.current!.emit('joinRoom', payload);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (joinRoomPromiseRef.current) {
          joinRoomPromiseRef.current.resolve(null);
          joinRoomPromiseRef.current = null;
        }
      }, 10000);
    });
  }, []);

  // Leave room
  const leaveRoom = useCallback((payload: { roomId: number }) => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot leave room');
      return;
    }

    console.log('🚪 Leaving room:', payload);
    socketRef.current.emit('leaveRoom', payload);
  }, []);

  // Get current room participants
  const getCurrentRoomParticipants = useCallback(async (payload: { roomId: number }): Promise<RoomParticipants | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot get participants');
      return null;
    }

    return new Promise((resolve) => {
      const handleResponse = (data: RoomParticipants) => {
        console.log('👥 Current room participants received:', data);
        setRoomParticipants(data);
        socketRef.current?.off('currentRoomParticipantsResult', handleResponse);
        resolve(data);
      };

      getParticipantsPromiseRef.current = { resolve, reject: () => {} };
      socketRef.current?.on('currentRoomParticipantsResult', handleResponse);
      console.log('👥 Getting current room participants:', payload);
      socketRef.current?.emit('getCurrentRoomParticipants', payload);

      // Timeout after 5 seconds
      setTimeout(() => {
        socketRef.current?.off('currentRoomParticipantsResult', handleResponse);
        if (getParticipantsPromiseRef.current) {
          getParticipantsPromiseRef.current.resolve(null);
          getParticipantsPromiseRef.current = null;
        }
      }, 5000);
    });
  }, []);

  // Check if user is currently in any active room
  const checkUserActiveRoom = useCallback(async (): Promise<UserActiveRoomResult | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot check user active room');
      return null;
    }

    return new Promise((resolve) => {
      const handleResponse = (data: UserActiveRoomResult) => {
        console.log('👤 User active room result received:', data);
        setUserActiveRoomStatus(data);
        socketRef.current?.off('userActiveRoomResult', handleResponse);
        resolve(data);
      };

      checkUserActiveRoomPromiseRef.current = { resolve, reject: () => {} };
      socketRef.current?.on('userActiveRoomResult', handleResponse);
      console.log('👤 Checking user active room');
      socketRef.current?.emit('getUserCurrentRoomStatus');

      // Timeout after 5 seconds
      setTimeout(() => {
        socketRef.current?.off('userActiveRoomResult', handleResponse);
        if (checkUserActiveRoomPromiseRef.current) {
          checkUserActiveRoomPromiseRef.current.resolve(null);
          checkUserActiveRoomPromiseRef.current = null;
        }
      }, 5000);
    });
  }, []);

  // Check if user can join a specific room (cross-room validation)
  const checkJoinerInRoom = useCallback(async (payload: { roomId: number, sessionId: number }): Promise<CheckJoinerInRoomResult | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot check joiner in room');
      return null;
    }

    return new Promise((resolve) => {
      const handleResponse = (data: CheckJoinerInRoomResult) => {
        console.log('🔍 Check joiner in room result received:', data);
        setCheckJoinerInRoomResult(data);
        socketRef.current?.off('checkJoinerInRoomResult', handleResponse);
        resolve(data);
      };

      checkJoinerInRoomPromiseRef.current = { resolve, reject: () => {} };
      socketRef.current?.on('checkJoinerInRoomResult', handleResponse);
      console.log('🔍 Checking joiner in room:', payload);
      socketRef.current?.emit('checkJoinerInRoom', payload);

      // Timeout after 5 seconds
      setTimeout(() => {
        socketRef.current?.off('checkJoinerInRoomResult', handleResponse);
        if (checkJoinerInRoomPromiseRef.current) {
          checkJoinerInRoomPromiseRef.current.resolve(null);
          checkJoinerInRoomPromiseRef.current = null;
        }
      }, 5000);
    });
  }, []);

  // Get game rooms list with joiners count
  const getGameRoomsList = useCallback(async (query?: any): Promise<GameRoomsListResponse | null> => {
    if (!socketRef.current?.connected) {
      console.warn('⚠️ WebSocket not connected, cannot get game rooms list');
      return null;
    }

    return new Promise((resolve) => {
      const handleResponse = (data: GameRoomsListResponse) => {
        console.log('📋 Game rooms list received:', data);
        setGameRoomsList(data);
        socketRef.current?.off('gameRoomsListResponse', handleResponse);
        resolve(data);
      };

      getGameRoomsListPromiseRef.current = { resolve, reject: () => {} };
      socketRef.current?.on('gameRoomsListResponse', handleResponse);
      console.log('📋 Getting game rooms list with query:', query);
      socketRef.current?.emit('getGameRoomsList', query || {});

      // Timeout after 5 seconds
      setTimeout(() => {
        socketRef.current?.off('gameRoomsListResponse', handleResponse);
        if (getGameRoomsListPromiseRef.current) {
          getGameRoomsListPromiseRef.current.resolve(null);
          getGameRoomsListPromiseRef.current = null;
        }
      }, 5000);
    });
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Auto-subscribe to room counts when connected (with debouncing)
  useEffect(() => {
    if (isConnected) {
      const cleanup = debouncedSubscribeRoomCounts();
      return cleanup;
    }
  }, [isConnected, debouncedSubscribeRoomCounts]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    connectionInfo,
    
    // Room counts
    roomCounts,
    subscribeRoomCountByGameType,
    
    // Current session
    currentSession,
    subscribeCurrentSession,
    
    // Room participants
    roomParticipants,
    joinRoom,
    leaveRoom,
    getCurrentRoomParticipants,
    checkJoinerInRoom,
    checkUserActiveRoom,
    
    // User status
    userActiveRoomStatus,
    checkJoinerInRoomResult,
    
    // Game rooms list
    gameRoomsList,
    getGameRoomsList,
    
    // Connection management
    connect,
    disconnect,
    
    // Error handling
    error,
    clearError,
  };
};

export default useGameRoomWebSocket;
```

## Usage Examples

### Basic Usage

```typescript
// components/GameRoomComponent.tsx
import React, { useEffect } from 'react';
import { useGameRoomWebSocket } from '../hooks/useGameRoomWebSocket';

const GameRoomComponent: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    connectionInfo,
    roomCounts,
    currentSession,
    roomParticipants,
    userActiveRoomStatus,
    checkJoinerInRoomResult,
    gameRoomsList,
    subscribeRoomCountByGameType,
    subscribeCurrentSession,
    joinRoom,
    leaveRoom,
    getCurrentRoomParticipants,
    checkJoinerInRoom,
    checkUserActiveRoom,
    getGameRoomsList,
    error,
    clearError,
  } = useGameRoomWebSocket({
    serverUrl: 'http://localhost:8008',
    autoConnect: true,
    onConnect: (info) => {
      console.log('Connected as user:', info.userId);
    },
    onDisconnect: () => {
      console.log('Disconnected from game rooms');
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Room counts are automatically subscribed when connected
  // No need to manually call subscribeRoomCountByGameType() in useEffect

  // Subscribe to current session for room 123
  useEffect(() => {
    if (isConnected) {
      subscribeCurrentSession(123);
    }
  }, [isConnected, subscribeCurrentSession]);

  const handleJoinRoom = async () => {
    try {
      const result = await joinRoom({ roomId: 123, sessionId: 456 });
      if (result?.success) {
        console.log('Successfully joined room:', result);
        console.log('Participants:', result.participants);
      } else {
        console.error('Failed to join room:', result?.error);
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom({ roomId: 123 });
  };

  const handleGetParticipants = async () => {
    try {
      const participants = await getCurrentRoomParticipants({ roomId: 123 });
      if (participants) {
        console.log('Current participants:', participants);
      } else {
        console.log('Failed to get participants');
      }
    } catch (error) {
      console.error('Error getting participants:', error);
    }
  };

  const handleCheckJoiner = async () => {
    try {
      const result = await checkJoinerInRoom({ roomId: 123, sessionId: 456 });
      if (result) {
        if (result.isAlreadyInRoom) {
          console.log('User is already in room:', result.currentRoom);
          console.log('Cannot join new room:', result.message);
        } else {
          console.log('User can join room:', result.message);
        }
      } else {
        console.log('Failed to check joiner status');
      }
    } catch (error) {
      console.error('Error checking joiner:', error);
    }
  };

  const handleCheckUserActiveRoom = async () => {
    try {
      const status = await checkUserActiveRoom();
      if (status) {
        if (status.isInActiveRoom) {
          console.log('User is currently in room:', status.currentRoom);
          console.log('Room name:', status.currentRoom?.roomName);
          console.log('Session status:', status.currentRoom?.sessionStatus);
          console.log('Is expired:', status.currentRoom?.isExpired);
        } else {
          console.log('User is not in any active room');
        }
      } else {
        console.log('Failed to check user active room');
      }
    } catch (error) {
      console.error('Error checking user active room:', error);
    }
  };

  const handleGetRoomCounts = async () => {
    try {
      const counts = await subscribeRoomCountByGameType();
      if (counts) {
        console.log('Room counts:', counts);
        alert(`Total rooms: ${counts.total.total.count}, Lottery: ${counts.lottery.total.count}, RPS: ${counts.rps.total.count}`);
      } else {
        alert('Failed to get room counts');
      }
    } catch (error) {
      console.error('Error getting room counts:', error);
    }
  };

  const handleGetGameRoomsList = async () => {
    try {
      // Example with query parameters
      const query = {
        page: 1,
        limit: 10,
        search: '',
        status: 'running',
        game_type_id: 1, // Lottery
        participation_amount: 0,
        sort_by: 'joiners_num',
        sort_order: 'desc'
      };
      
      const roomsList = await getGameRoomsList(query);
      if (roomsList) {
        console.log('Game rooms list:', roomsList);
        alert(`Found ${roomsList.rooms.length} game rooms (page ${roomsList.pagination.page}/${roomsList.pagination.totalPages}) with real-time joiners count`);
      } else {
        alert('Failed to get game rooms list');
      }
    } catch (error) {
      console.error('Error getting game rooms list:', error);
    }
  };

  if (isConnecting) {
    return <div>Connecting to game rooms...</div>;
  }

  if (!isConnected) {
    return <div>Not connected to game rooms</div>;
  }

  return (
    <div>
      <h2>Game Room WebSocket</h2>
      
      {connectionInfo && (
        <div>
          <p>Connected as: {connectionInfo.userId || 'Guest'}</p>
          <p>Client ID: {connectionInfo.clientId}</p>
        </div>
      )}

      {error && (
        <div style={{ color: 'red' }}>
          <p>Error: {error}</p>
          <button onClick={clearError}>Clear Error</button>
        </div>
      )}

      {roomCounts && (
        <div>
          <h3>Room Counts</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <h4>Total</h4>
            <p>Pending: {roomCounts.total.pending.count}</p>
            <p>Running: {roomCounts.total.running.count}</p>
            <p>End: {roomCounts.total.end.count}</p>
            <p>Total: {roomCounts.total.total.count}</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4>Lottery</h4>
            <p>Pending: {roomCounts.lottery.pending.count}</p>
            <p>Running: {roomCounts.lottery.running.count}</p>
            <p>End: {roomCounts.lottery.end.count}</p>
            <p>Total: {roomCounts.lottery.total.count}</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4>RPS</h4>
            <p>Pending: {roomCounts.rps.pending.count}</p>
            <p>Running: {roomCounts.rps.running.count}</p>
            <p>End: {roomCounts.rps.end.count}</p>
            <p>Total: {roomCounts.rps.total.count}</p>
          </div>

          <p>Last Updated: {roomCounts.total.lastUpdated}</p>
        </div>
      )}

      {currentSession && (
        <div>
          <h3>Current Session</h3>
          <p>Room ID: {currentSession.roomId}</p>
          {currentSession.current_session ? (
            <div>
              <p>Session ID: {currentSession.current_session.id}</p>
              <p>Status: {currentSession.current_session.status}</p>
              <p>Participants: {currentSession.current_session.participants_count}/{currentSession.current_session.max_participants}</p>
              <p>Can Join: {currentSession.current_session.can_join ? 'Yes' : 'No'}</p>
            </div>
          ) : (
            <p>No active session</p>
          )}
        </div>
      )}

      {userActiveRoomStatus && (
        <div>
          <h3>User Current Room Status</h3>
          <p>Is Already In Room: {userActiveRoomStatus.isInActiveRoom ? 'Yes' : 'No'}</p>
          {userActiveRoomStatus.currentRoom ? (
            <div>
              <p>Current Room: {userActiveRoomStatus.currentRoom.roomName} (ID: {userActiveRoomStatus.currentRoom.roomId})</p>
              <p>Session ID: {userActiveRoomStatus.currentRoom.sessionId}</p>
              <p>Session Status: {userActiveRoomStatus.currentRoom.sessionStatus}</p>
              <p>Session Started: {new Date(userActiveRoomStatus.currentRoom.timeStart).toLocaleString()}</p>
              <p>Is Expired: {userActiveRoomStatus.currentRoom.isExpired ? 'Yes' : 'No'}</p>
            </div>
          ) : (
            <p>Not currently in any room</p>
          )}
          <p>Message: {userActiveRoomStatus.message}</p>
        </div>
      )}

      {checkJoinerInRoomResult && (
        <div>
          <h3>Check Joiner In Room Result</h3>
          <p>Success: {checkJoinerInRoomResult.success ? 'Yes' : 'No'}</p>
          <p>Room ID: {checkJoinerInRoomResult.roomId}</p>
          <p>Session ID: {checkJoinerInRoomResult.sessionId}</p>
          <p>Is Already In Room: {checkJoinerInRoomResult.isAlreadyInRoom ? 'Yes' : 'No'}</p>
          {checkJoinerInRoomResult.currentRoom ? (
            <div>
              <p>Current Room: {checkJoinerInRoomResult.currentRoom.roomName} (ID: {checkJoinerInRoomResult.currentRoom.roomId})</p>
              <p>Session ID: {checkJoinerInRoomResult.currentRoom.sessionId}</p>
              <p>Session Status: {checkJoinerInRoomResult.currentRoom.sessionStatus}</p>
              <p>Session Started: {new Date(checkJoinerInRoomResult.currentRoom.timeStart).toLocaleString()}</p>
            </div>
          ) : (
            <p>Not currently in any room</p>
          )}
          <p>Message: {checkJoinerInRoomResult.message}</p>
        </div>
      )}

      {roomParticipants && (
        <div>
          <h3>Room Participants ({roomParticipants.totalCount})</h3>
          <p>Room ID: {roomParticipants.roomId}</p>
          <p>Session ID: {roomParticipants.sessionId}</p>
          <ul>
            {roomParticipants.participants.map((participant, index) => (
              <li key={index}>
                <strong>{participant.username || 'Unknown'}</strong> ({participant.fullname || 'N/A'})
                <br />
                Wallet: {participant.wallet_address}
                <br />
                Amount: {participant.amount}
                <br />
                Joined: {new Date(participant.time_join).toLocaleString()}
                <br />
                Status: {participant.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      {gameRoomsList && (
        <div>
          <h3>Game Rooms List ({gameRoomsList.rooms.length} rooms)</h3>
          <p>Page: {gameRoomsList.pagination.page} of {gameRoomsList.pagination.totalPages} (Total: {gameRoomsList.pagination.total})</p>
          <p>Last Updated: {new Date(gameRoomsList.timestamp).toLocaleString()}</p>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {gameRoomsList.rooms.map((room, index) => (
              <div key={index} style={{ padding: '10px', border: '1px solid #ccc', margin: '5px 0' }}>
                <strong>Room {room.id}: {room.name}</strong>
                <br />
                Participation Amount: {room.participation_amount}
                <br />
                Current Joiners: {room.joiners_num}
                <br />
                Status: {room.status}
                <br />
                Game Type: {room.game_type_id?.name || 'Unknown'}
                <br />
                Owner: {room.owner?.username || 'Unknown'}
                <br />
                Latest Session ID: {room.latest_session_id || 'None'}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button onClick={handleJoinRoom}>Join Room</button>
        <button onClick={handleLeaveRoom}>Leave Room</button>
        <button onClick={handleGetParticipants}>Get Participants</button>
        <button onClick={handleCheckJoiner}>Check Joiner In Room</button>
        <button onClick={handleCheckUserActiveRoom}>Check User Active Room</button>
        <button onClick={handleGetRoomCounts}>Get Room Counts</button>
        <button onClick={handleGetGameRoomsList}>Get Game Rooms List</button>
      </div>
    </div>
  );
};

export default GameRoomComponent;
```

### Advanced Usage with Real-time Updates

```typescript
// pages/game-rooms.tsx
import React, { useState, useEffect } from 'react';
import { useGameRoomWebSocket } from '../hooks/useGameRoomWebSocket';

const GameRoomsPage: React.FC = () => {
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const {
    isConnected,
    roomCounts,
    currentSession,
    roomParticipants,
    userActiveRoomStatus,
    checkJoinerInRoomResult,
    gameRoomsList,
    subscribeRoomCountByGameType,
    subscribeCurrentSession,
    joinRoom,
    leaveRoom,
    getCurrentRoomParticipants,
    checkJoinerInRoom,
    checkUserActiveRoom,
    getGameRoomsList,
    error,
  } = useGameRoomWebSocket({
    serverUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    autoConnect: true,
    onConnect: (info) => {
      console.log('Connected to game rooms:', info);
    },
    onError: (error) => {
      console.error('Game room WebSocket error:', error);
    },
  });

  // Room counts are automatically subscribed when connected
  // No need to manually subscribe

  // Subscribe to current session when room changes
  useEffect(() => {
    if (isConnected && selectedRoomId) {
      subscribeCurrentSession(selectedRoomId);
    }
  }, [isConnected, selectedRoomId, subscribeCurrentSession]);

  // Listen for real-time participant updates
  useEffect(() => {
    if (roomParticipants && roomParticipants.roomId === selectedRoomId) {
      console.log('Participants updated for room:', roomParticipants.roomId);
    }
  }, [roomParticipants, selectedRoomId]);

  // Listen for real-time game rooms list updates
  useEffect(() => {
    if (gameRoomsList) {
      console.log('Game rooms list updated:', gameRoomsList.rooms.length, 'rooms');
    }
  }, [gameRoomsList]);

  const handleJoinRoom = async (roomId: number) => {
    try {
      // First check if user is already in a room
      const checkResult = await checkJoinerInRoom({ roomId, sessionId: 0 }); // sessionId 0 for general check
      if (checkResult?.isAlreadyInRoom) {
        alert(`You are already in room "${checkResult.currentRoom?.roomName}" (ID: ${checkResult.currentRoom?.roomId}). Please wait for the current session to end.`);
        return;
      }

      if (!checkResult?.success) {
        alert(`Cannot join room: ${checkResult?.message || 'Unknown error'}`);
        return;
      }

      const result = await joinRoom({ roomId, sessionId: 0 }); // sessionId 0 for general join
      if (result?.success) {
        alert(`Successfully joined room ${roomId}`);
        setSelectedRoomId(roomId);
      } else {
        alert(`Failed to join room: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Error joining room');
    }
  };

  const handleLeaveRoom = (roomId: number) => {
    leaveRoom({ roomId });
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
    }
  };

  if (!isConnected) {
    return <div>Connecting to game rooms...</div>;
  }

  return (
    <div>
      <h1>Game Rooms</h1>
      
      {error && (
        <div style={{ color: 'red', padding: '10px', margin: '10px 0', border: '1px solid red' }}>
          Error: {error}
        </div>
      )}

      {roomCounts && (
        <div style={{ margin: '20px 0' }}>
          <h2>Room Statistics</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <h3>Total</h3>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>Pending: {roomCounts.total.pending.count}</div>
              <div>Running: {roomCounts.total.running.count}</div>
              <div>End: {roomCounts.total.end.count}</div>
              <div>Total: {roomCounts.total.total.count}</div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>Lottery</h3>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>Pending: {roomCounts.lottery.pending.count}</div>
              <div>Running: {roomCounts.lottery.running.count}</div>
              <div>End: {roomCounts.lottery.end.count}</div>
              <div>Total: {roomCounts.lottery.total.count}</div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>RPS</h3>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>Pending: {roomCounts.rps.pending.count}</div>
              <div>Running: {roomCounts.rps.running.count}</div>
              <div>End: {roomCounts.rps.end.count}</div>
              <div>Total: {roomCounts.rps.total.count}</div>
            </div>
          </div>
        </div>
      )}

      {currentSession && (
        <div style={{ margin: '20px 0' }}>
          <h2>Current Session (Room {currentSession.roomId})</h2>
          {currentSession.current_session ? (
            <div>
              <p>Session ID: {currentSession.current_session.id}</p>
              <p>Status: {currentSession.current_session.status}</p>
              <p>Participants: {currentSession.current_session.participants_count}/{currentSession.current_session.max_participants}</p>
              <p>Can Join: {currentSession.current_session.can_join ? 'Yes' : 'No'}</p>
            </div>
          ) : (
            <p>No active session</p>
          )}
        </div>
      )}

      {roomParticipants && roomParticipants.roomId === selectedRoomId && (
        <div style={{ margin: '20px 0' }}>
          <h2>Room Participants ({roomParticipants.totalCount})</h2>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {roomParticipants.participants.map((participant, index) => (
              <div key={index} style={{ padding: '5px', border: '1px solid #ccc', margin: '2px 0' }}>
                <strong>{participant.username || 'Unknown'}</strong> ({participant.fullname || 'N/A'})
                <br />
                Wallet: {participant.wallet_address}
                <br />
                Amount: {participant.amount}
                <br />
                Joined: {new Date(participant.time_join).toLocaleString()}
                <br />
                Status: {participant.status}
              </div>
            ))}
          </div>
        </div>
      )}

      {gameRoomsList && (
        <div style={{ margin: '20px 0' }}>
          <h2>Available Game Rooms ({gameRoomsList.rooms.length} rooms)</h2>
          <p>Last Updated: {new Date(gameRoomsList.timestamp).toLocaleString()}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {gameRoomsList.rooms.map((room) => (
              <div key={room.id} style={{ 
                padding: '15px', 
                border: '1px solid #ddd', 
                borderRadius: '8px',
                backgroundColor: selectedRoomId === room.id ? '#e3f2fd' : '#f9f9f9'
              }}>
                <h3>Room {room.id}: {room.name}</h3>
                <p><strong>Participation Amount:</strong> {room.participation_amount}</p>
                <p><strong>Current Joiners:</strong> {room.joiners_num}</p>
                <p><strong>Status:</strong> {room.status}</p>
                <p><strong>Latest Session:</strong> {room.latest_session_id || 'None'}</p>
                
                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleJoinRoom(room.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: selectedRoomId === room.id ? '#007bff' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedRoomId === room.id ? 'Joined' : 'Join Room'}
                  </button>
                  {selectedRoomId === room.id && (
                    <button
                      onClick={() => handleLeaveRoom(room.id)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Leave
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ margin: '20px 0' }}>
        <button 
          onClick={() => getGameRoomsList()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Refresh Game Rooms List
        </button>
      </div>
    </div>
  );
};

export default GameRoomsPage;
```

## Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_WEBSOCKET_URL=http://localhost:8008
```

## WebSocket Events

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribeRoomCountByGameType` | - | Subscribe to room counts for all game types |
| `subscribeCurrentSession` | `roomId: number` | Subscribe to current session for a specific room |
| `joinRoom` | `{ roomId: number, sessionId: number }` | Join a room and get participants list |
| `leaveRoom` | `{ roomId: number }` | Leave a room |
| `getCurrentRoomParticipants` | `{ roomId: number }` | Get current participants for a room |
| `checkJoinerInRoom` | `{ roomId: number, sessionId: number }` | Check if user can join a specific room (cross-room validation) |
| `getUserCurrentRoomStatus` | - | Check if user is currently in any active room (simplified) |
| `getGameRoomsList` | `{ page?, limit?, search?, status?, game_type_id?, participation_amount?, sort_by?, sort_order? }` | Get list of game rooms with real-time joiners count (with pagination and filters) |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `ConnectionInfo` | Connection established with user info |
| `gameRoomCounts` | `GameRoomCounts` | Room counts data (all game types) |
| `currentSession` | `CurrentSessionSnapshot` | Current session snapshot |
| `currentSessionUpdated` | `CurrentSessionSnapshot` | Session status changed |
| `joinRoomResult` | `JoinRoomResult` | Join room result with participants |
| `roomParticipantsUpdated` | `RoomParticipants` | Real-time participants update (broadcast) |
| `currentRoomParticipantsResult` | `RoomParticipants` | Current room participants result |
| `checkJoinerInRoomResult` | `CheckJoinerInRoomResult` | Result of checkJoinerInRoom validation |
| `userCurrentRoomStatusResult` | `UserActiveRoomResult` | Result of getUserCurrentRoomStatus check |
| `gameRoomsListResponse` | `GameRoomsListResponse` | Response to getGameRoomsList request |
| `gameRoomsListUpdated` | `GameRoomsListUpdated` | Real-time update when game rooms list changes |
| `gameRoomsListError` | `{ error: string; timestamp: string }` | Error getting game rooms list |
| `error` | `{ message: string }` | Error occurred |

## Features

### ✅ Implemented Features

1. **Connection Management**
   - Auto-connect on mount
   - Manual connect/disconnect
   - Connection state tracking
   - Error handling

2. **Room Counts**
   - Subscribe to room counts for all game types (pending, running, end only)
   - Real-time updates when session status changes
   - Automatic broadcast on `GameRoom.sessionStatusChanged` event
   - Excludes sessions with `out` status
   - Error handling

3. **Current Session**
   - Subscribe to current session for a room
   - Real-time session updates
   - Session status tracking

4. **Room Participants**
   - Join room functionality
   - Get current participants list
   - Real-time participant updates
   - Leave room functionality
   - Check if user is already in a room
   - Get user's current room status
   - Cross-room validation with detailed room info
   - Promise-based API for async operations
   - Timeout handling
   - **🆕 Automatic status broadcasting when sessions change**

5. **Game Rooms List**
   - Get list of all game rooms with real-time joiners count
   - Real-time updates when joiners count changes
   - Automatic broadcast on `GameRoom.roomListUpdated` event
   - Promise-based API for async operations
   - Timeout handling
   - Error handling

6. **Error Handling**
   - Comprehensive error states
   - Error clearing functionality
   - Connection error handling
   - Server validation error handling

### 🔧 Configuration Options

- **serverUrl**: WebSocket server URL
- **autoConnect**: Whether to connect automatically on mount
- **onConnect**: Callback when connected
- **onDisconnect**: Callback when disconnected
- **onError**: Callback for errors

## Performance Considerations

- **Optimized Queries**: Server uses TypeORM QueryBuilder for better performance
- **Caching**: Server implements 2-second cache for room counts (`CACHE_TTL = 2000ms`)
- **Debouncing**: Server uses 100ms debouncing for broadcasts (`BROADCAST_DEBOUNCE = 100ms`) and 500ms for subscriptions (`SUBSCRIPTION_DEBOUNCE = 500ms`)
- **Real-time Updates**: Automatic updates without polling
- **Memory Management**: Automatic cleanup on unmount
- **Promise-based**: Efficient async operations with timeout handling
- **Filtered Data**: Only processes sessions with `pending`, `running`, `end` status (excludes `out`)
- **Session Validation**: Built-in session expiration checking (3-minute timeout)
- **User Validation**: Prevents duplicate room participation
- **Cross-Room Validation**: Server-side validation to prevent multiple room participation
- **Real-time Error Handling**: Immediate feedback for join failures
- **🆕 Automatic Status Broadcasting**: Real-time notifications when sessions change, eliminating manual status checks
- **Connection Optimization**: Supports both WebSocket and polling transports for better compatibility

## Error Handling

The hook provides comprehensive error handling for:
- Connection errors
- WebSocket errors
- Join room failures
- Session expiration errors
- User validation errors
- Cross-room validation errors
- Join room validation errors
- Timeout scenarios
- Invalid responses
- Server validation errors

## TypeScript Support

The hook is fully typed with TypeScript interfaces for all data structures and return types, providing excellent IDE support and type safety.

## Troubleshooting

### Common Issues

1. **"Unauthorized" Error**
   - Ensure JWT token is present in cookies
   - Check if token is valid and not expired
   - Verify user exists in database

2. **Connection Issues**
   - Check server URL configuration
   - Verify WebSocket server is running
   - Check network connectivity

3. **Room Not Found**
   - Verify room ID exists
   - Check if room is active

4. **No Active Session**
   - Check if there's a PENDING session for the room
   - Verify session hasn't expired

5. **User Already in Room**
   - Use `checkJoinerInRoom` to verify user status
   - Check if user is in ANY other room with active session
   - Verify session expiration (3-minute timeout)
   - Check latest session only (not all historical sessions)

6. **Cross-Room Validation Error**
   - Use `checkJoinerInRoom` to verify user status
   - Check if user has already joined another room
   - Verify session status (PENDING/RUNNING)
   - Handle "You are already in room X" message

7. **Game Rooms List Issues**
   - Check if `getGameRoomsList()` returns null (connection issue)
   - Verify `gameRoomsListUpdated` events are being received
   - Check if joiners count is updating in real-time
   - Handle `gameRoomsListError` events properly

### Debug Tips

1. **Enable Console Logging**
   ```typescript
   const { joinRoom } = useGameRoomWebSocket({
     onError: (error) => console.error('WebSocket Error:', error),
   });
   ```

2. **Check Connection State**
   ```typescript
   const { isConnected, connectionInfo } = useGameRoomWebSocket();
   console.log('Connected:', isConnected, 'Info:', connectionInfo);
   ```

3. **Handle Promise Rejections**
   ```typescript
   try {
     const result = await joinRoom({ roomId: 123, sessionId: 456 });
     if (result?.error) {
       console.error('Join failed:', result.error);
     }
   } catch (error) {
     console.error('Join error:', error);
   }
   ```

4. **Check User Status Before Joining**
   ```typescript
   const checkResult = await checkJoinerInRoom({ roomId: 123, sessionId: 456 });
   if (checkResult?.isAlreadyInRoom) {
     console.log('User is already in another room:', checkResult.message);
     console.log('Current room:', checkResult.currentRoom?.roomName, 'Session:', checkResult.currentRoom?.sessionId);
   } else {
     console.log('User can join room:', checkResult?.message);
   }
   ```

5. **Handle Cross-Room Validation**
   ```typescript
   const { checkJoinerInRoom } = useGameRoomWebSocket();
   
   // Check before joining a room
   const handleJoinRoom = async (roomId: number) => {
     const checkResult = await checkJoinerInRoom({ roomId, sessionId: 0 });
     if (checkResult?.isAlreadyInRoom) {
       console.log('User already in another room:', checkResult.message);
       console.log('Current room:', checkResult.currentRoom?.roomName);
       return;
     }
     
     // Proceed with joining room
     console.log('User can join room');
   };
   ```

6. **Handle Game Rooms List**
   ```typescript
   const { gameRoomsList, getGameRoomsList } = useGameRoomWebSocket();
   
   // Get rooms list
   const handleGetRoomsList = async () => {
     const roomsList = await getGameRoomsList();
     if (roomsList) {
       console.log('Rooms list:', roomsList.rooms);
       roomsList.rooms.forEach(room => {
         console.log(`Room ${room.id}: ${room.joiners_num} joiners`);
       });
     } else {
       console.log('Failed to get rooms list');
     }
   };
   
   // Listen for real-time updates
   useEffect(() => {
     if (gameRoomsList) {
       console.log('Rooms list updated:', gameRoomsList.rooms.length, 'rooms');
     }
   }, [gameRoomsList]);
   ```

## Cross-Room Validation & Duplicate Join Prevention

### 🔒 **Server-side Validation**
The WebSocket gateway includes comprehensive validation to prevent users from joining multiple rooms simultaneously:

#### **How it works:**
1. **Event Trigger**: When `checkJoinerInRoom` message is received with `{ roomId, sessionId }`
2. **Database Check**: Server queries for existing joins by the same user in ANY other room with active session
3. **Status Validation**: Checks for `EXECUTED` status in `PENDING` or `RUNNING` sessions (latest session only)
4. **Session Expiration**: Checks if the target session has expired (3+ minutes)
5. **Response**: Emits `checkJoinerInRoomResult` with validation result and room details

#### **Events Emitted:**
- **`checkJoinerInRoomResult`**: Validation result with detailed message

#### **Response Messages:**
- `"You are already in room 'RoomName' (ID: X). You can only join one room at a time."` - User already in another room
- `"Session has expired"` - Current session has expired
- `"User can join this room"` - User is free to join
- `"User not authenticated"` - Authentication required
- `"Session has expired, you can now join other rooms"` - Session expired, user can join other rooms

### 🎯 **Business Logic:**
- **One Room Per User**: User can only join one room at a time
- **Cross-Room Validation**: Checks if user is already in ANY other room with active session
- **Latest Session Only**: Only considers the latest session of each room
- **Session Expiration**: User can join new room only when current session expires
- **Real-time Feedback**: Immediate response to join attempts
- **Data Integrity**: Prevents duplicate participation records

### 🕐 **Session Expiration Logic**
The system implements a 3-minute session timeout mechanism:

#### **Session States:**
- **PENDING**: Session waiting for participants (0-3 minutes)
- **RUNNING**: Session active with enough participants
- **END**: Session completed successfully
- **OUT**: Session expired due to insufficient participants

#### **User Join Rules:**
1. **Active Session**: User cannot join another room if already in a PENDING/RUNNING session
2. **Session Expired**: User can join new room only when current session expires (3+ minutes)
3. **Insufficient Participants**: If session expires with < required participants, user is marked as OUT
4. **Sufficient Participants**: If session expires with ≥ required participants, session becomes RUNNING

#### **Validation Flow:**
```
User calls checkJoinerInRoom({ roomId: B, sessionId: B_session })
    ↓
Check if user already in Room A with active session (EXECUTED status)
    ↓
If YES: Return isAlreadyInRoom=true, currentRoom={A details}, success=false
    ↓
If NO: Check if Room B session expired (3+ minutes)
    ↓
If expired: Return isAlreadyInRoom=false, currentRoom=null, success=false, message="Session has expired"
    ↓
If not expired: Return isAlreadyInRoom=false, currentRoom=null, success=true, message="User can join this room"
```

## Join Room Functionality

### 🚪 **Join Room with Session ID**
The `joinRoom` method requires both `roomId` and `sessionId` parameters to properly join a room and receive real-time updates.

#### **Payload Structure:**
```typescript
{
  roomId: number;    // ID of the room to join
  sessionId: number; // ID of the current session (can be 0 for general join)
}
```

#### **How it works:**
1. **Client Request**: `joinRoom({ roomId: 123, sessionId: 456 })`
2. **Server Processing**: 
   - Joins client to room WebSocket namespace
   - Broadcasts current participants to all clients in room
   - Returns join result with participants list
3. **Real-time Updates**: Client receives `roomParticipantsUpdated` events

#### **Response Data:**
```typescript
{
  success: boolean;
  roomId: number;
  sessionId: number;
  participants: Participant[];
  totalCount: number;
  message?: string;
  timestamp: string;
  error?: string;
}
```

#### **Use Cases:**
- **Join Specific Session**: Use actual sessionId for specific session
- **General Join**: Use sessionId: 0 for general room join
- **Real-time Updates**: Receive live participant updates
- **Room Navigation**: Join multiple rooms for different sessions

## Automatic User Status Updates

### 🚀 **New Feature: Automatic Status Broadcasting**
The WebSocket gateway now automatically broadcasts user room status updates when session status changes, eliminating the need for clients to manually check their status.

#### **How it works:**
1. **Event Trigger**: When any session status changes (PENDING → RUNNING → END/OUT)
2. **Automatic Detection**: Server identifies all users participating in that session
3. **Status Update**: Server automatically broadcasts updated status to all affected users
4. **Real-time Notification**: Users receive immediate notifications about their room availability

#### **Events Automatically Emitted:**
- **`userCurrentRoomStatusResult`**: Updated user room status
- **`checkJoinerInRoomResult`**: Notification when user can join other rooms

#### **Automatic Notifications:**
```typescript
// When session ends or expires
{
  success: true,
  roomId: 0, // General notification
  sessionId: 0,
  isAlreadyInRoom: false,
  currentRoom: null,
  message: "Session in room 'RoomName' has ended. You can now join other rooms."
}

// When user becomes free to join any room
{
  success: true,
  roomId: 0, // General notification
  sessionId: 0,
  isAlreadyInRoom: false,
  currentRoom: null,
  message: "You are now free to join any room."
}
```

#### **Benefits:**
- ✅ **No Manual Checking**: Users don't need to manually check their status
- ✅ **Real-time Updates**: Immediate notifications when sessions change
- ✅ **Better UX**: Users know instantly when they can join other rooms
- ✅ **Reduced API Calls**: Eliminates need for frequent status checks

#### **Technical Implementation:**
- **Event Trigger**: `@OnEvent('GameRoom.sessionStatusChanged')` automatically calls `broadcastUserRoomStatusUpdate()`
- **Participant Detection**: Queries all users with `EXECUTED` status in the affected session
- **Client Mapping**: Maps user IDs to connected WebSocket clients using `connectedClients` Map
- **Status Broadcasting**: Emits `userCurrentRoomStatusResult` and `checkJoinerInRoomResult` events
- **Performance Optimized**: Uses TypeORM QueryBuilder for efficient database queries
- **Error Handling**: Comprehensive try-catch blocks with detailed logging

## Game Rooms List with Real-time Joiners Count

### 📋 **New Feature: getGameRoomsList**
This feature allows clients to get a list of all game rooms with real-time joiners count. The joiners count is automatically updated when users join or leave rooms, providing accurate real-time information.

#### **How it works:**
1. **Event Trigger**: When `getGameRoomsList` message is received (no payload required)
2. **Database Query**: Server queries all active game rooms with their current joiners count
3. **Real-time Count**: Calculates joiners count from the latest session of each room
4. **Auto-sync**: Automatically updates `joiners_num` field in database if needed
5. **Response**: Emits `gameRoomsListResponse` with complete rooms list

#### **Events:**
- **Client → Server**: `getGameRoomsList` (no payload required)
- **Server → Client**: `gameRoomsListResponse` with `GameRoomsListResponse` data
- **Server → Client**: `gameRoomsListUpdated` with `GameRoomsListUpdated` data (real-time updates)
- **Server → Client**: `gameRoomsListError` with error information

#### **Response Data:**
```typescript
{
  rooms: [
    {
      id: number;
      name: string;
      symbol: string;
      participation_amount: number;
      prizes_num: number;
      joiners_num: number;        // Real-time count
      status: string;
      game_type_id: {
        id: number;
        name: string;
      } | null;
      owner: {
        id: number;
        username: string;
        fullname: string;
        avatar: string;
      };
      latest_session_id: number | null;
      current_session: {
        id: number;
        status: string;
        time_start: string;
        session: string;
      } | null;
    }
  ];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}
```

#### **Real-time Updates:**
When someone joins or leaves a room, the server automatically broadcasts `gameRoomsListUpdated` to all connected clients:

```typescript
{
  rooms: GameRoomWithJoiners[];  // Updated rooms list
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  updatedRoomId: number;         // Which room was updated
  action: string;                // 'join' or 'leave'
  timestamp: string;
}
```

#### **Usage Example:**
```typescript
const { gameRoomsList, getGameRoomsList } = useGameRoomWebSocket();

// Get initial rooms list with filters
const handleGetRoomsList = async () => {
  const query = {
    page: 1,
    limit: 10,
    search: '',
    status: 'running',
    game_type_id: 1, // Lottery
    participation_amount: 0,
    sort_by: 'joiners_num',
    sort_order: 'desc'
  };
  
  const roomsList = await getGameRoomsList(query);
  if (roomsList) {
    console.log('Found', roomsList.rooms.length, 'rooms');
    console.log('Pagination:', roomsList.pagination);
    roomsList.rooms.forEach(room => {
      console.log(`Room ${room.id}: ${room.joiners_num} joiners`);
    });
  }
};

// Listen for real-time updates
useEffect(() => {
  if (gameRoomsList) {
    console.log('Rooms list updated:', gameRoomsList.rooms.length, 'rooms');
    console.log('Current page:', gameRoomsList.pagination.page);
    // Update UI with new joiners count
  }
}, [gameRoomsList]);
```

#### **Use Cases:**
- **Room Browser**: Display all available rooms with current joiners count
- **Real-time Dashboard**: Show live statistics of room participation
- **Room Selection**: Help users choose rooms based on current activity
- **Admin Monitoring**: Track room usage and participation in real-time
- **Filtered Views**: Filter rooms by game type, status, participation amount
- **Pagination**: Handle large numbers of rooms efficiently
- **Search**: Find specific rooms by name, owner, or ID
- **Sorting**: Sort by joiners count, participation amount, or name

#### **Performance Features:**
- **Optimized Queries**: Uses efficient database queries with proper joins
- **Auto-sync**: Automatically syncs joiners count with database
- **Real-time Updates**: Instant updates when joiners count changes
- **Pagination**: Efficient handling of large datasets
- **Filtering**: Server-side filtering for better performance
- **Search**: Optimized search with numeric and text support
- **Sorting**: Multiple sorting options with database-level optimization
- **Error Handling**: Comprehensive error handling with timeout protection
- **Promise-based**: Clean async API with proper error handling

## User Active Room Check

### 🔍 **New Feature: checkUserActiveRoom**
This feature allows clients to check if a user is currently in any active room without specifying a particular room. This is a simplified version that only requires the user to be authenticated.

#### **How it works:**
1. **Event Trigger**: When `getUserCurrentRoomStatus` message is received (no payload required)
2. **Database Check**: Server queries for existing joins by the user in ANY room with active session
3. **Status Validation**: Checks for `EXECUTED` status in `PENDING` or `RUNNING` sessions (latest session only)
4. **Session Expiry Check**: Automatically checks if the current session has expired (3+ minutes)
5. **Response**: Emits `userCurrentRoomStatusResult` with detailed room information

#### **Events:**
- **Client → Server**: `getUserCurrentRoomStatus` (no payload required)
- **Server → Client**: `userCurrentRoomStatusResult` with `UserActiveRoomResult` data

#### **Response Data:**
```typescript
{
  success: boolean;
  isInActiveRoom: boolean;
  currentRoom: {
    roomId: number;
    roomName: string;
    sessionId: number;
    sessionStatus: string;
    timeStart: string;
    isExpired: boolean;
  } | null;
  message?: string;
  error?: string;
}
```

#### **Usage Example:**
```typescript
const { checkUserActiveRoom } = useGameRoomWebSocket();

const handleCheckActiveRoom = async () => {
  const result = await checkUserActiveRoom();
  if (result?.isInActiveRoom) {
    console.log('User is in room:', result.currentRoom?.roomName);
    if (result.currentRoom?.isExpired) {
      console.log('Session has expired, user can join other rooms');
    }
  } else {
    console.log('User is not in any active room');
  }
};
```

#### **Use Cases:**
- **Check User Status**: Before showing room list, check if user is already in a room
- **Display Current Room**: Show user which room they're currently in
- **Session Expiration**: Check if current session has expired
- **Room Navigation**: Allow user to return to their current room

### 🎯 **Using Automatic Status Broadcasting**

#### **Client-side Implementation:**
```typescript
const { userActiveRoomStatus, checkJoinerInRoom } = useGameRoomWebSocket();

// Listen for automatic status updates
useEffect(() => {
  if (userActiveRoomStatus) {
    if (userActiveRoomStatus.isInActiveRoom) {
      console.log('User is in room:', userActiveRoomStatus.currentRoom);
      
      // Check if session has expired
      if (userActiveRoomStatus.currentRoom?.isExpired) {
        console.log('Session expired, user can join other rooms');
        // Update UI to show user can join other rooms
      }
    } else {
      console.log('User is free to join any room');
      // Update UI to show all available rooms
    }
  }
}, [userActiveRoomStatus]);

// Listen for automatic join notifications
useEffect(() => {
  // This will be automatically triggered when session status changes
  const handleAutomaticNotification = (data) => {
    if (data.message?.includes('can now join other rooms')) {
      console.log('Automatic notification:', data.message);
      // Update UI to enable room joining
    }
  };
  
  // The hook automatically handles these events
}, []);
```

#### **Benefits for Developers:**
- ✅ **No Polling Required**: No need to periodically check user status
- ✅ **Immediate Updates**: Users get instant notifications when sessions change
- ✅ **Reduced Complexity**: Eliminates need for manual status checking logic
- ✅ **Better Performance**: Reduces unnecessary API calls
- ✅ **Improved UX**: Users always know their current status

## Session Status Filtering

### 🚫 **Excluded Status: OUT**
This hook and the underlying WebSocket gateway **exclude sessions with `out` status** from all operations:

- **Room Counts**: Only counts sessions with `pending`, `running`, `end` status
- **Current Session**: Only returns sessions with valid statuses
- **Participants**: Only shows participants from active sessions
- **Real-time Updates**: Only broadcasts updates for valid sessions

### ✅ **Supported Statuses**
- **PENDING**: Sessions waiting to start
- **RUNNING**: Active game sessions
- **END**: Completed game sessions

### 🔧 **Why Exclude OUT?**
- **Data Integrity**: OUT sessions represent cancelled/failed sessions
- **Performance**: Reduces unnecessary data processing
- **User Experience**: Only shows meaningful session data
- **Business Logic**: OUT sessions don't contribute to room statistics

## Updated Features

### 🆕 **Optimized Performance**
- **TypeORM QueryBuilder**: All queries use QueryBuilder instead of raw SQL
- **Better Type Safety**: Improved TypeScript support
- **Efficient Data Mapping**: Proper entity relationships
- **Reduced Database Load**: Optimized queries with proper joins
- **Filtered Sessions**: Only processes `pending`, `running`, `end` sessions (excludes `out`)
- **Advanced Caching**: 2-second cache TTL for room counts with automatic invalidation
- **Smart Debouncing**: 100ms broadcast debouncing and 500ms subscription debouncing
- **Connection Flexibility**: Supports both WebSocket and polling transports

### 🆕 **Enhanced Real-time Updates**
- **Automatic Broadcasting**: Room counts and participants update automatically
- **Event-driven**: Uses internal events for real-time updates
- **No Polling**: Eliminates need for manual refresh
- **Debounced Updates**: Prevents excessive broadcasts (100ms debouncing)
- **Session Expiration**: Built-in 3-minute session timeout checking
- **User Validation**: Prevents duplicate room participation
- **Cross-Room Validation**: Server-side validation with real-time feedback
- **Comprehensive Join Validation**: Detailed validation with clear messages
- **🆕 Automatic Status Broadcasting**: Real-time user status updates when sessions change
- **🆕 Game Rooms List with Realtime Joiners**: Real-time updates of joiners count for all rooms
- **🆕 Automatic Room List Broadcasting**: Real-time updates when joiners count changes
- **Smart Cache Management**: 2-second cache with automatic invalidation on changes
- **Connection State Management**: Tracks connected clients and user mappings

### 🆕 **Improved Error Handling**
- **Comprehensive Validation**: Server-side validation for all operations
- **Clear Error Messages**: Descriptive error responses
- **Timeout Handling**: Prevents hanging operations
- **Connection Recovery**: Automatic reconnection support
- **Session Validation**: Built-in session expiration checking
- **User Status Validation**: Prevents invalid room participation
- **Cross-Room Validation Detection**: Real-time validation with immediate feedback
- **Comprehensive Join Validation**: Detailed validation with clear messages
- **🆕 Automatic Status Broadcasting**: Real-time notifications when sessions change, eliminating manual status checks