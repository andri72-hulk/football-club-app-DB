import { createClient } from "@nhost/nhost-js";

// Progetto Nhost "football-club-app" (creato il 26/08/2026, region Frankfurt).
// Subdomain e region non sono dati sensibili (equivalenti all'URL pubblico
// di un progetto Supabase), quindi li teniamo diretti qui nel codice.
export const nhost = createClient({
  subdomain: "yhwdniifxkffjoiwnvyq",
  region: "eu-central-1",
});

