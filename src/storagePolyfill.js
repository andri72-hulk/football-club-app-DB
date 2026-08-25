// Ricrea l'API window.storage usata dall'app appoggiandosi a Nhost
// (Postgres + Hasura GraphQL) invece che a Supabase. Stessa identica
// interfaccia esterna (get/set/delete/list con chiave + flag "shared"),
// quindi il resto di App.jsx non richiede ALCUNA modifica: è lo stesso
// meccanismo già usato per passare da IndexedDB a Supabase.

import { nhost } from "./nhostClient.js";

async function requireUserId() {
  const user = nhost.auth.getUser();
  if (!user) {
    throw new Error("Utente non autenticato: effettua il login per salvare o caricare i dati.");
  }
  return user.id;
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
    const data = await gql(
      `query Get($key: String!, $shared: Boolean!, $ownerId: uuid) {
        app_storage(
          where: { storage_key: { _eq: $key }, shared: { _eq: $shared }, owner_id: { _eq: $ownerId } }
          limit: 1
        ) { value }
      }`,
      { key, shared, ownerId: shared ? null : userId }
    );
    const row = data.app_storage?.[0];
    if (!row) throw new Error(`Storage key not found: ${key}`);
    return { key, value: row.value, shared: !!shared };
  },

  async set(key, value, shared = false) {
    const userId = await requireUserId();

    const findExisting = async () => {
      const data = await gql(
        `query Find($key: String!, $shared: Boolean!, $ownerId: uuid) {
          app_storage(
            where: { storage_key: { _eq: $key }, shared: { _eq: $shared }, owner_id: { _eq: $ownerId } }
            limit: 1
          ) { id }
        }`,
        { key, shared, ownerId: shared ? null : userId }
      );
      return data.app_storage?.[0] || null;
    };

    const existing = await findExisting();

    if (existing) {
      await gql(
        `mutation Update($id: uuid!, $value: String, $ownerId: uuid) {
          update_app_storage_by_pk(pk_columns: { id: $id }, _set: { value: $value, owner_id: $ownerId, updated_at: "now()" }) { id }
        }`,
        { id: existing.id, value, ownerId: userId }
      );
      return { key, value, shared: !!shared };
    }

    try {
      await gql(
        `mutation Insert($key: String!, $shared: Boolean!, $ownerId: uuid, $value: String) {
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
          `mutation Update($id: uuid!, $value: String, $ownerId: uuid) {
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
    await gql(
      `mutation Delete($key: String!, $shared: Boolean!, $ownerId: uuid) {
        delete_app_storage(where: { storage_key: { _eq: $key }, shared: { _eq: $shared }, owner_id: { _eq: $ownerId } }) { affected_rows }
      }`,
      { key, shared, ownerId: shared ? null : userId }
    );
    return { key, deleted: true, shared: !!shared };
  },

  async list(prefix = "", shared = false) {
    const userId = await requireUserId();
    const data = await gql(
      `query List($prefix: String!, $shared: Boolean!, $ownerId: uuid) {
        app_storage(
          where: { storage_key: { _like: $prefix }, shared: { _eq: $shared }, owner_id: { _eq: $ownerId } }
        ) { storage_key }
      }`,
      { prefix: `${prefix}%`, shared, ownerId: shared ? null : userId }
    );
    return { keys: (data.app_storage || []).map((r) => r.storage_key), prefix, shared: !!shared };
  },
};

if (typeof window !== "undefined") {
  window.storage = storagePolyfill;
}

export default storagePolyfill;
