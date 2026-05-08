import { useState, useCallback } from 'react';

// Using relative path for Vite proxy or direct URL for production
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const useSignaling = () => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(async (offer: any) => {
    try {
      const res = await fetch(`${API_URL}/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer })
      });
      const data = await res.json();
      setRoomId(data.roomId);
      return data.roomId;
    } catch (e) {
      setError('Failed to create room');
      return null;
    }
  }, []);

  const pollForAnswer = useCallback(async (id: string, maxAttempts = 60) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`${API_URL}/room/${id}/answer`);
        const data = await res.json();
        if (data.answer) {
          return data.answer;
        }
      } catch (e) {
        console.error(e);
      }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    setError('Timeout waiting for answer');
    return null;
  }, []);

  const getOffer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/room/${id}`);
      if (!res.ok) {
        setError('Invalid room code');
        return null;
      }
      const data = await res.json();
      return data.offer;
    } catch (e) {
      setError('Failed to fetch offer');
      return null;
    }
  }, []);

  const postAnswer = useCallback(async (id: string, answer: any) => {
    try {
      const res = await fetch(`${API_URL}/room/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer })
      });
      return res.ok;
    } catch (e) {
      setError('Failed to post answer');
      return false;
    }
  }, []);

  return {
    roomId,
    error,
    createRoom,
    pollForAnswer,
    getOffer,
    postAnswer
  };
};
