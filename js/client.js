// Creates one shared Supabase client for the whole page.
// Requires, in this order, before this script tag:
//   1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   2. <script src="js/config.js"></script>
// The CDN script exposes a global `supabase` object with .createClient().
// We rename our client to `db` so it doesn't collide with that global.

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
