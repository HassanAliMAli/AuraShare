import { useState, useEffect } from 'react';

interface Device {
  id: string;
  name: string;
  icon: string;
  status: 'online' | 'busy' | 'away';
  angle: number;
  radius: number;
}

const INITIAL_DEVICES: Device[] = [
  { id: '1', name: 'Hiro\'s MacBook', icon: '💻', status: 'online', angle: -45, radius: 240 },
  { id: '2', name: 'Sarah\'s iPhone', icon: '📱', status: 'online', angle: 160, radius: 280 },
];

export const useDiscovery = () => {
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);

  useEffect(() => {
    // Simulate a new device appearing after a few seconds
    const timer = setTimeout(() => {
      setDevices(prev => [
        ...prev,
        { id: '3', name: 'Living Room TV', icon: '📺', status: 'online', angle: 75, radius: 220 }
      ]);
    }, 5000);

    const timer2 = setTimeout(() => {
      setDevices(prev => [
        ...prev,
        { id: '4', name: 'Alex\'s iPad', icon: 'タブレット', status: 'online', angle: 240, radius: 260 }
      ]);
    }, 8000);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, []);

  return { devices };
};
