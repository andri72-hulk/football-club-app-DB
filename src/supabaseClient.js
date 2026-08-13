import { createClient } from "@supabase/supabase-js";

// Le variabili d'ambiente devono avere il prefisso VITE_ per essere
// esposte al codice client-side da Vite (vedi .env in locale e
// le Environment Variables del progetto su Vercel).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variabili d'ambiente Supabase mancanti: controlla VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (file .env in locale, Environment Variables su Vercel)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
