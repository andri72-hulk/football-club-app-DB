// Ricrea l'API window.storage usata dall'app appoggiandosi a Nhost
// (Postgres + Hasura GraphQL) invece che a Supabase. Stessa identica
// interfaccia esterna (get/set/delete/list con chiave + flag "shared"),
// quindi il resto di App.jsx non richiede ALCUNA modifica: è lo stesso
// meccanismo già usato per passare da IndexedDB a Supabase.

import { nhost } from "./nhostClient.js";

// L'id dell'utente collegato viene impostato direttamente da AuthGate.jsx
// subito dopo un login/registrazione riuscita (dalla risposta stessa della
// chiamata), invece di richiederlo di nuovo all'SDK: in questa versione
// dell'SDK Nhost, richiederlo separatamente non è affidabile.
let currentUserId = null;

export function setAuthUserId(id) {
  currentUserId = id;
}

async function requireUserId() {
  if (!currentUserId) {
    throw new Error("Utente non autenticato: effettua il login per salvare o caricare i dati.");
  }
  return currentUserId;
}

async function gql(query, variables) {
  const result = await nhost.graphql.request({ query, variables });
  if (result.body?.errors?.length) {
    throw new Error("Errore GraphQL: " + result.body.errors[0].message);
  }
  return result.body.data;
}

const storagePolyfill = {
  async get(key, shared = false) {
    const userId = await requireUserId();
    const query = shared
      ? `query Get($key: String!) {
          app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: true } }, limit: 1) { value }
        }`
      : `query Get($key: String!, $ownerId: uuid!) {
          app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: false }, owner_id: { _eq: $ownerId } }, limit: 1) { value }
        }`;
    const data = await gql(query, shared ? { key } : { key, ownerId: userId });
    const row = data.app_storage?.[0];
    if (!row) {
      const notFoundErr = new Error(`Storage key not found: ${key}`);
      notFoundErr.code = "NOT_FOUND";
      throw notFoundErr;
    }
    return { key, value: row.value, shared: !!shared };
  },

  async set(key, value, shared = false) {
    const userId = await requireUserId();
    const updatedAt = new Date().toISOString();
    // Upsert in un'unica chiamata (invece di "controlla se esiste, poi scrivi"):
    // dimezza il numero di richieste al server per ogni salvataggio, riducendo
    // il carico sull'istanza gratuita di Nhost.
    const mutation = shared
      ? `mutation Upsert($key: String!, $ownerId: uuid!, $value: String, $updatedAt: timestamptz!) {
          insert_app_storage_one(
            object: { storage_key: $key, shared: true, owner_id: $ownerId, value: $value, updated_at: $updatedAt }
            on_conflict: { constraint: app_storage_shared_key, update_columns: [value, updated_at, owner_id] }
          ) { id }
        }`
      : `mutation Upsert($key: String!, $ownerId: uuid!, $value: String, $updatedAt: timestamptz!) {
          insert_app_storage_one(
            object: { storage_key: $key, shared: false, owner_id: $ownerId, value: $value, updated_at: $updatedAt }
            on_conflict: { constraint: app_storage_personal_key, update_columns: [value, updated_at, owner_id] }
          ) { id }
        }`;
    await gql(mutation, { key, ownerId: userId, value, updatedAt });
    return { key, value, shared: !!shared };
  },

  async delete(key, shared = false) {
    const userId = await requireUserId();
    const mutation = shared
      ? `mutation Delete($key: String!) {
          delete_app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: true } }) { affected_rows }
        }`
      : `mutation Delete($key: String!, $ownerId: uuid!) {
          delete_app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: false }, owner_id: { _eq: $ownerId } }) { affected_rows }
        }`;
    await gql(mutation, shared ? { key } : { key, ownerId: userId });
    return { key, deleted: true, shared: !!shared };
  },

  async list(prefix = "", shared = false) {
    const userId = await requireUserId();
    const query = shared
      ? `query List($prefix: String!) {
          app_storage(where: { storage_key: { _like: $prefix }, shared: { _eq: true } }) { storage_key }
        }`
      : `query List($prefix: String!, $ownerId: uuid!) {
          app_storage(where: { storage_key: { _like: $prefix }, shared: { _eq: false }, owner_id: { _eq: $ownerId } }) { storage_key }
        }`;
    const data = await gql(query, shared ? { prefix: `${prefix}%` } : { prefix: `${prefix}%`, ownerId: userId });
    return { keys: (data.app_storage || []).map((r) => r.storage_key), prefix, shared: !!shared };
  },
};

if (typeof window !== "undefined") {
  window.storage = storagePolyfill;
}

export default storagePolyfill;
