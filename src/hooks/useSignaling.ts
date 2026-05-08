import { useState, useCallback, useEffect, useRef } from 'react';

// For a world-class "no-touch" experience, we'll use a high-speed polling strategy 
// but optimized with "Unique Stream" logic to bypass KV's 10-second lag.
const API_URL = '/api';

export const useSignaling = () => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<boolean>(false);

  const createRoom = useCallback(async (offer: any) => {
    try {
      const res = await fetch(`${API_URL}/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Cosmic Error');
        return null;
      }
      setRoomId(data.roomId);
      return data.roomId;
    } catch (e) {
      setError('Network Failure');
      return null;
    }
  }, []);

  const pollForAnswer = useCallback(async (id: string) => {
    pollingRef.current = true;
    let attempts = 0;
    while (attempts < 120 && pollingRef.current) {
      try {
        const res = await fetch(`${API_URL}/room/${id}/answer`);
        const data = await res.json();
        if (data.answer) return data.answer;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }
    return null;
  }, []);

  const getOffer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/room/${id}`);
      const data = await res.json();
      return res.ok ? data.offer : null;
    } catch (e) {
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
      return false;
    }
  }, []);

  const addCandidate = useCallback(async (id: string, type: 'sender' | 'receiver', candidate: any) => {
    try {
      await fetch(`${API_URL}/room/${id}/candidates/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate })
      });
    } catch (e) {}
  }, []);

  const getCandidates = useCallback(async (id: string, type: 'sender' | 'receiver') => {
    try {
      const res = await fetch(`${API_URL}/room/${id}/candidates/${type}`);
      const data = await res.json();
      return data.candidates || [];
    } catch (e) {
      return [];
    }
  }, []);

  const clearError = () => setError(null);

  useEffect(() => {
    return () => { pollingRef.current = false; };
  }, []);

  return {
    roomId,
    error,
    createRoom,
    pollForAnswer,
    getOffer,
    postAnswer,
    addCandidate,
    getCandidates,
    clearError
  };
};
