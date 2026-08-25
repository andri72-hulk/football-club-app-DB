import React, { useEffect, useState } from "react";
import { Shield, Mail, Lock, LogOut, Loader2, LogIn, UserPlus } from "lucide-react";
import { nhost } from "./nhostClient.js";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { body, error } = await nhost.auth.signUpEmailPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        if (body?.session) {
          setSession(body.session);
        } else {
          setInfo("Account creato. Controlla la tua email per confermarlo, poi accedi qui con Login.");
          setMode("login");
        }
      } else {
        const { body, error } = await nhost.auth.signInEmailPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        setSession(body.session);
      }
    } catch (err) {
      setError(err.message || "Operazione non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    nhost.auth.signOut().catch(() => {});
    setSession(null);
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-emerald-500" />
            </div>
            <h1 className="text-xl font-semibold text-white">Football Club App</h1>
            <p className="text-sm text-slate-500 mt-1">
              {mode === "login" ? "Accedi per continuare" : "Crea il tuo account"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label className="text-xs text-slate-400 mb-1.5 block">Indirizzo email</label>
            <div className="relative mb-3">
              <Mail className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
                placeholder="mister@club.it"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
            <div className="relative mb-3">
              <Lock className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            {info && <p className="text-xs text-emerald-400 mb-3">{info}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {busy ? "Attendere..." : mode === "login" ? "Accedi" : "Crea account"}
            </button>

            <button
              type="button"
              onClick={() => { setMode((m) => (m === "login" ? "signup" : "login")); setError(""); setInfo(""); }}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 mt-4"
            >
              {mode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleLogout}
        title="Esci"
        className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center shadow-lg"
      >
        <LogOut className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}
