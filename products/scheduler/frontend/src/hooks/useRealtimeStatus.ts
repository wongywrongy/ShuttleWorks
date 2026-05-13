/**
 * Surfaces the Supabase Realtime connection state so the
 * ConnectionIndicator (Step G) can pair it with the FastAPI
 * reachability signal.
 *
 * Independent of the data subscription (``subscribeToMatches`` in
 * ``lib/realtime.ts``) — this is just a status sensor. We open a
 * lightweight always-on channel and watch its lifecycle events.
 *
 * Local-dev mode (``supabase`` is null) returns ``disconnected``
 * permanently; the indicator's "both offline → red" path applies
 * after the 60-second threshold lapses, which is the desired
 * behaviour (no Supabase = no realtime).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type RealtimeStatus = 'connected' | 'reconnecting' | 'disconnected';

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>(
    supabase === null ? 'disconnected' : 'reconnecting',
  );

  useEffect(() => {
    if (supabase === null) {
      setStatus('disconnected');
      return;
    }
    const client = supabase;
    const channel = client
      .channel('connection-status')
      .subscribe((channelStatus) => {
        // Supabase emits a small set of event names: SUBSCRIBED on
        // successful join, CHANNEL_ERROR / TIMED_OUT on failure,
        // CLOSED when intentionally torn down.
        switch (channelStatus) {
          case 'SUBSCRIBED':
            setStatus('connected');
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setStatus('reconnecting');
            break;
          case 'CLOSED':
            setStatus('disconnected');
            break;
          default:
            // Unknown status — leave the current state. Supabase
            // hasn't documented an event we'd want to react to
            // outside of the four above.
            break;
        }
      });
    return () => {
      client.removeChannel(channel);
    };
  }, []);

  return status;
}
