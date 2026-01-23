import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../lib/api';
import { useInquiriesStore } from '../stores/inquiries';

export function useSocket(isAuthenticated: boolean): void {
  const socketRef = useRef<Socket | null>(null);

  const {
    handleInquiryCreated,
    handleInquiryUpdated,
    handleInquiryDeleted,
    handleResourceCreated,
    handleResourceDeleted,
  } = useInquiriesStore();

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if not authenticated
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    // Create socket connection
    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });

    // Listen for events
    socket.on('inquiry:created', handleInquiryCreated);
    socket.on('inquiry:updated', handleInquiryUpdated);
    socket.on('inquiry:deleted', handleInquiryDeleted);
    socket.on('resource:created', handleResourceCreated);
    socket.on('resource:deleted', handleResourceDeleted);

    // Cleanup on unmount
    return () => {
      socket.off('inquiry:created', handleInquiryCreated);
      socket.off('inquiry:updated', handleInquiryUpdated);
      socket.off('inquiry:deleted', handleInquiryDeleted);
      socket.off('resource:created', handleResourceCreated);
      socket.off('resource:deleted', handleResourceDeleted);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    isAuthenticated,
    handleInquiryCreated,
    handleInquiryUpdated,
    handleInquiryDeleted,
    handleResourceCreated,
    handleResourceDeleted,
  ]);
}
