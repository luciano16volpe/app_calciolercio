// Accesso con email e password (Supabase Auth) e ruolo nella lega.
// I permessi veri li decide il database (Row Level Security): qui si decide solo cosa mostrare.
import { useQuery } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logEvent } from '../data/audit';
import { supabase } from '../data/supabase';
import { useMyPremium } from '../data/premium';
import { changeCacheOwner } from './accountCache';

export type Role = 'admin' | 'redazione' | 'member' | null;

interface AuthTools {
  user: User | null;
  /** true finché non si sa se c'è già un accesso salvato */
  loading: boolean;
  /** arrivato dal link "imposta la password": va scelta la nuova */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  /** manda via email il link per scegliere (o cambiare) la password */
  sendReset: (email: string) => Promise<string | null>;
  setPassword: (password: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthTools | null>(null);

/** Traduce gli errori di Supabase in frasi semplici. */
function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corrette.';
  if (/email not confirmed/i.test(msg)) return "L'email non è ancora confermata.";
  if (/rate limit|too many/i.test(msg)) return 'Troppi tentativi: riprova tra qualche minuto.';
  if (/password should be at least/i.test(msg)) return 'La password deve avere almeno 6 caratteri.';
  if (/failed to fetch|network/i.test(msg)) return 'Nessuna connessione: riprova.';
  return msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let changed = false;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (changed || !mounted) return;
      changeCacheOwner(data.session?.user.id ?? null);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      changed = true;
      changeCacheOwner(s?.user.id ?? null);
      setLoading(false);
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // chi conferma l'email dal link arriva già con l'accesso: la registrazione si registra ora
      if (event === 'SIGNED_IN' && /type=signup/.test(window.location.hash)) void logEvent('auth.signup');
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) void logEvent('auth.login');
    return error ? friendly(error.message) : null;
  }, []);
  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { display_name: name.trim() || email.trim().split('@')[0] }, emailRedirectTo: window.location.origin },
    });
    if (error) return { error: friendly(error.message), needsConfirm: false };
    if (data.session) void logEvent('auth.signup');
    // con la conferma email attiva non c'è ancora una sessione: va aperto il link ricevuto
    return { error: null, needsConfirm: !data.session };
  }, []);
  const signOut = useCallback(async () => {
    await logEvent('auth.logout'); // prima di uscire: serve ancora l'accesso
    await supabase.auth.signOut();
  }, []);
  const sendReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (!error) void logEvent('auth.password_reset', email.trim());
    return error ? friendly(error.message) : null;
  }, []);
  const setPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setRecovery(false);
      void logEvent('auth.password_changed');
    }
    return error ? friendly(error.message) : null;
  }, []);

  const value = useMemo(
    () => ({ user: session?.user ?? null, loading, recovery, signIn, signUp, signOut, sendReset, setPassword }),
    [session, loading, recovery, signIn, signUp, signOut, sendReset, setPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthTools {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth va usato dentro AuthProvider');
  return v;
}

/** Ruolo di chi è entrato nella lega (null = non è un membro, oppure non ha fatto l'accesso). */
export function useRole(leagueId: string | undefined): { role: Role; isAdmin: boolean; canEditText: boolean; /** il ruolo è stato letto (finché non lo è, `role` è vuoto) */ ready: boolean } {
  const { user } = useAuth();
  const premium = useMyPremium(user?.id ?? null);
  const q = useQuery({
    queryKey: ['role', leagueId, user?.id],
    enabled: !!user && !!leagueId,
    queryFn: async (): Promise<Role> => {
      const { data, error } = await supabase.from('league_members').select('role').eq('league_id', leagueId as string).eq('user_id', (user as User).id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.role as Role) ?? null;
    },
  });
  const role = user ? (q.data ?? null) : null;
  const ready = !user || !leagueId || ((q.isSuccess || q.isError) && (premium.isSuccess || premium.isError));
  const isAdmin = role === 'admin' && premium.data?.active === true;
  return { role, isAdmin, canEditText: isAdmin || role === 'redazione', ready };
}
