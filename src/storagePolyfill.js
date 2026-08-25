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
    if (!row) throw new Error(`Storage key not found: ${key}`);
    return { key, value: row.value, shared: !!shared };
  },

  async set(key, value, shared = false) {
    const userId = await requireUserId();

    const findExisting = async () => {
      const query = shared
        ? `query Find($key: String!) {
            app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: true } }, limit: 1) { id }
          }`
        : `query Find($key: String!, $ownerId: uuid!) {
            app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: false }, owner_id: { _eq: $ownerId } }, limit: 1) { id }
          }`;
      const data = await gql(query, shared ? { key } : { key, ownerId: userId });
      return data.app_storage?.[0] || null;
    };

    const existing = await findExisting();

    if (existing) {
      await gql(
        `mutation Update($id: uuid!, $value: String, $ownerId: uuid!) {
          update_app_storage_by_pk(pk_columns: { id: $id }, _set: { value: $value, owner_id: $ownerId, updated_at: "now()" }) { id }
        }`,
        { id: existing.id, value, ownerId: userId }
      );
      return { key, value, shared: !!shared };
    }

    try {
      await gql(
        `mutation Insert($key: String!, $shared: Boolean!, $ownerId: uuid!, $value: String) {
          insert_app_storage_one(object: { storage_key: $key, shared: $shared, owner_id: $ownerId, value: $value }) { id }
        }`,
        { key, shared, ownerId: userId, value }
      );
    } catch (err) {
      // Race condition: un'altra scrittura concorrente ha creato la riga
      // nel frattempo. Ritentiamo come aggiornamento.
      const retryExisting = await findExisting();
      if (retryExisting) {
        await gql(
          `mutation Update($id: uuid!, $value: String, $ownerId: uuid!) {
            update_app_storage_by_pk(pk_columns: { id: $id }, _set: { value: $value, owner_id: $ownerId, updated_at: "now()" }) { id }
          }`,
          { id: retryExisting.id, value, ownerId: userId }
        );
      } else {
        throw err;
      }
    }
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
