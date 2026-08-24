// Ricrea l'API window.storage usata dall'app appoggiandosi a Supabase
// invece che a IndexedDB locale. Stessa identica interfaccia esterna
// (get/set/delete/list con chiave + flag "shared"), quindi il resto
// di App.jsx non richiede modifiche.
//
// "shared = false" (personale): la riga è visibile solo a chi l'ha
// creata (owner_id = utente autenticato).
// "shared = true" (condiviso): la riga è visibile a chiunque sia
// autenticato nel progetto Supabase (tutto lo staff invitato).
//
// Nota: a differenza della versione IndexedDB, questa richiede un
// utente autenticato (login via magic link) per poter leggere/scrivere.

import { supabase } from "./supabaseClient.js";

const TABLE = "app_storage";

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Utente non autenticato: effettua il login per salvare o caricare i dati.");
  }
  return data.user;
}

const storagePolyfill = {
  async get(key, shared = false) {
    const user = await requireUser();
    let query = supabase.from(TABLE).select("value").eq("storage_key", key).eq("shared", shared);
    if (!shared) query = query.eq("owner_id", user.id);

    const { data, error } = await query.maybeSingle();
    if (error) {
      const netErr = new Error("Storage get failed: " + error.message);
      netErr.code = "NETWORK_ERROR";
      throw netErr;
    }
    if (!data) {
      const notFoundErr = new Error(`Storage key not found: ${key}`);
      notFoundErr.code = "NOT_FOUND";
      throw notFoundErr;
    }
    return { key, value: data.value, shared: !!shared };
  },

  async set(key, value, shared = false) {
    const user = await requireUser();

    const findExisting = async () => {
      let q = supabase.from(TABLE).select("id").eq("storage_key", key).eq("shared", shared);
      if (!shared) q = q.eq("owner_id", user.id);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error("Storage set failed (lettura preliminare): " + error.message);
      return data;
    };

    const existing = await findExisting();

    if (existing) {
      const { error } = await supabase
        .from(TABLE)
        .update({ value, updated_at: new Date().toISOString(), owner_id: user.id })
        .eq("id", existing.id);
      if (error) throw new Error("Storage set failed: " + error.message);
      return { key, value, shared: !!shared };
    }

    const { error: insertError } = await supabase
      .from(TABLE)
      .insert({ storage_key: key, shared, owner_id: user.id, value });

    if (insertError) {
      // Race condition: un'altra scrittura concorrente ha creato la riga
      // nel frattempo (raro, es. due dispositivi che salvano insieme).
      // Ritentiamo come aggiornamento invece di far fallire il salvataggio.
      if (insertError.code === "23505") {
        const retryExisting = await findExisting();
        if (retryExisting) {
          const { error: updateError } = await supabase
            .from(TABLE)
            .update({ value, updated_at: new Date().toISOString(), owner_id: user.id })
            .eq("id", retryExisting.id);
          if (updateError) throw new Error("Storage set failed: " + updateError.message);
          return { key, value, shared: !!shared };
        }
      }
      throw new Error("Storage set failed: " + insertError.message);
    }

    return { key, value, shared: !!shared };
  },

  async delete(key, shared = false) {
    const user = await requireUser();
    let q = supabase.from(TABLE).delete().eq("storage_key", key).eq("shared", shared);
    if (!shared) q = q.eq("owner_id", user.id);
    const { error } = await q;
    if (error) throw new Error("Storage delete failed: " + error.message);
    return { key, deleted: true, shared: !!shared };
  },

  async list(prefix = "", shared = false) {
    const user = await requireUser();
    let q = supabase.from(TABLE).select("storage_key").eq("shared", shared).like("storage_key", `${prefix}%`);
    if (!shared) q = q.eq("owner_id", user.id);
    const { data, error } = await q;
    if (error) throw new Error("Storage list failed: " + error.message);
    return { keys: (data || []).map((r) => r.storage_key), prefix, shared: !!shared };
  },
};

if (typeof window !== "undefined") {
  window.storage = storagePolyfill;
}

export default storagePolyfill;
