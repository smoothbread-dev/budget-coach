// supabase.js
const SUPABASE_URL = 'https://ovjoxowtubkzlbthnigw.supabase.co/rest/v1/'         // 👈 Project URL
const SUPABASE_KEY = 'sb_publishable_gp9FtJKT8qIXxIzYqndXMw_IEhOdA3o'            // 👈 Publishable key

const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
