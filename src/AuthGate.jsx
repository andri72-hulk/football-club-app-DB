import React, { useEffect, useState } from "react";
import { Shield, Mail, LogOut, Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient.js";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ancora da verificare
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSendLink(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      setError(error.message || "Invio del link non riuscito. Riprova.");
    } else {
      setLinkSent(true);
    }
  }

  // Sessione ancora da verificare al primo caricamento
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  // Utente non autenticato: schermata di login
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-emerald-500" />
            </div>
            <h1 className="text-xl font-semibold text-white">Football Club App</h1>
            <p className="text-sm text-slate-500 mt-1">Accedi per continuare</p>
          </div>

          {linkSent ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <Mail className="w-6 h-6 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm text-slate-300">
                Ti abbiamo inviato un link di accesso a <span className="text-white font-medium">{email}</span>.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Apri l'email e clicca sul link per entrare nell'app (controlla anche lo spam).
              </p>
              <button
                onClick={() => {
                  setLinkSent(false);
                  setEmail("");
                }}
                className="text-xs text-emerald-500 hover:text-emerald-400 mt-4"
              >
                Usa un altro indirizzo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendLink} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <label className="text-xs text-slate-400 mb-1.5 block">Indirizzo email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mister@club.it"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 mb-3"
              />
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? "Invio in corso..." : "Invia link di accesso"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Utente autenticato: mostra l'app, con un piccolo controllo di logout in alto
  return (
    <div className="relative">
      <button
        onClick={() => supabase.auth.signOut()}
        title="Esci"
        className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center shadow-lg"
      >
        <LogOut className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}
