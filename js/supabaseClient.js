/* global supabase */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://ildicqhzwynhhkhwycmj.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGljcWh6d3luaGhraHd5Y21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NzAzNTQsImV4cCI6MjA5MzA0NjM1NH0.pTOozCpK5E2s_nShEFQaVTL3cxf8USqwD2D4wCQXa5Y';

  if (typeof supabase === 'undefined' || !supabase || typeof supabase.createClient !== 'function') {
    console.error('[YairSupabase] Falta cargar el SDK https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 ANTES de supabaseClient.js');
    return;
  }

  var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'yair-auth'
    }
  });

  async function signIn(email, password) {
    var resp = await client.auth.signInWithPassword({ email: email, password: password });
    if (resp.error) throw resp.error;
    return resp.data;
  }

  async function signOut() {
    var resp = await client.auth.signOut();
    if (resp.error) throw resp.error;
    return true;
  }

  async function currentUser() {
    var resp = await client.auth.getUser();
    if (resp.error) return null;
    return resp.data && resp.data.user ? resp.data.user : null;
  }

  async function currentSession() {
    var resp = await client.auth.getSession();
    if (resp.error) return null;
    return resp.data && resp.data.session ? resp.data.session : null;
  }

  function onAuthChange(handler) {
    return client.auth.onAuthStateChange(function (event, session) {
      try {
        handler({ event: event, session: session, user: session ? session.user : null });
      } catch (e) {
        console.error('[YairSupabase] handler auth error', e);
      }
    });
  }

  function publicStorageUrl(bucket, path) {
    if (!path) return '';
    var data = client.storage.from(bucket).getPublicUrl(path);
    return (data && data.data && data.data.publicUrl) || '';
  }

  async function uploadFile(bucket, path, file, opts) {
    var options = Object.assign({ upsert: true, cacheControl: '3600' }, opts || {});
    var resp = await client.storage.from(bucket).upload(path, file, options);
    if (resp.error) throw resp.error;
    return publicStorageUrl(bucket, path);
  }

  global.YairSupabase = {
    SUPABASE_URL: SUPABASE_URL,
    client: client,
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    currentSession: currentSession,
    onAuthChange: onAuthChange,
    publicStorageUrl: publicStorageUrl,
    uploadFile: uploadFile
  };
})(window);
