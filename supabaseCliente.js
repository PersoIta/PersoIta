/* =========================================================
   supabaseClient.js
   Cria o client do Supabase e expõe em window.db.
   Este arquivo DEVE ser carregado ANTES do app.js.
   ========================================================= */

(function () {
  if (typeof window.supabase === "undefined") {
    console.error(
      "A biblioteca do Supabase não foi carregada. " +
      "Verifique a tag <script src='...@supabase/supabase-js@2'>."
    );
    return;
  }

  // Ajuste com suas credenciais
    const SUPABASE_URL = "https://tzolokxetilunyfzovav.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_0HJWnbqDMg1LFwLuhaRLDg_FvEXwxZd";

  try {
    window.db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    console.log("[supabaseClient] window.db criado com sucesso.");
  } catch (error) {
    console.error(
      "[supabaseClient] Erro ao criar o client:",
      error
    );
  }
})();