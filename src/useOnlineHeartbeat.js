import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';

export function useOnlineHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const deviceId =
      window.localStorage.getItem('device_id') || crypto.randomUUID();
    window.localStorage.setItem('device_id', deviceId);

    const sendHeartbeat = async () => {
      await supabase
        .from('online_status')
        .upsert(
          {
            user_id: user.id,
            device_id: deviceId,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 20000);

    window.addEventListener('beforeunload', sendHeartbeat);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', sendHeartbeat);
    };
  }, [user]);
}
