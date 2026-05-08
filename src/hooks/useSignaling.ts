import { useState, useCallback } from 'react';

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
      if (!res.ok) {
        setError(data.message || 'Failed to create room');
        return null;
      }
      setRoomId(data.roomId);
      return data.roomId;
    } catch (e) {
      setError('Cosmic network failure');
      return null;
    }
  }, []);

  const pollForAnswer = useCallback(async (id: string, maxAttempts = 60) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`${API_URL}/room/${id}/answer`);
        const data = await res.json();
        if (data.answer) return data.answer;
      } catch (e) {
        console.error(e);
      }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    return null;
  }, []);

  const getOffer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/room/${id}`);
      const data = await res.json();
      if (!res.ok) return null;
      return data.offer;
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
    } catch (e) {
      console.error('Failed to send candidate');
    }
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
