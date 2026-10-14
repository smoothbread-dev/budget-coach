import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// window.supabase is provided by the pinned UMD bundle loaded in index.html.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
