(function () {
  // Shared admin authentication for admin.html and upload.html.
  //
  // Replaces the previous sessionStorage flag, which only toggled UI visibility: any
  // visitor could set it from the console and reach the dashboard. Since uploading now
  // hangs off this login, the gate has to be a real CloudBase session — the RLS policies
  // on video_assets distinguish anon from authenticated, so an authenticated session is
  // also what actually makes writes possible.

  const state = {
    app: null,
    auth: null,
    user: null,
  };

  async function getAuth() {
    if (state.auth) return state.auth;
    await window.ExperimentStore.whenReady;
    const app = window.ExperimentStore.getCloudBaseApp?.();
    if (!app) throw new Error('CloudBase 尚未初始化，请检查网络与环境配置。');
    state.app = app;
    state.auth = typeof app.auth === 'function' ? app.auth() : app.auth;
    return state.auth;
  }

  function isRealUser(session) {
    // signInAnonymously() in store.js also produces a session, so an anonymous one must
    // not count as being logged in.
    if (!session) return false;
    const user = session.user || session;
    if (user?.is_anonymous === true || user?.isAnonymous === true) return false;
    const provider = user?.app_metadata?.provider || user?.provider || '';
    return provider !== 'anonymous';
  }

  async function currentSession() {
    try {
      const auth = await getAuth();
      const result = typeof auth.getSession === 'function' ? await auth.getSession() : null;
      const session = result?.data?.session ?? result?.session ?? result?.data ?? null;
      return isRealUser(session) ? session : null;
    } catch (error) {
      return null;
    }
  }

  async function isAuthenticated() {
    const session = await currentSession();
    state.user = session?.user || null;
    return Boolean(session);
  }

  async function signIn(username, password) {
    const auth = await getAuth();
    const result = await auth.signIn({ username, password });
    if (result?.error) throw new Error(result.error.message || '账号或密码错误。');
    if (!(await isAuthenticated())) {
      throw new Error('登录未生效，请重试或确认该账号已在 CloudBase 中启用。');
    }
    return state.user;
  }

  async function signOut() {
    try {
      const auth = await getAuth();
      if (typeof auth.signOut === 'function') await auth.signOut();
    } finally {
      state.user = null;
    }
  }

  /**
   * Guards a page that must not render for anonymous visitors. Returns true when a real
   * session exists; otherwise redirects to admin.html and returns false.
   */
  async function requireAuth(redirectTo = 'admin.html') {
    if (await isAuthenticated()) return true;
    window.location.replace(redirectTo);
    return false;
  }

  function currentUserLabel() {
    const user = state.user;
    if (!user) return '';
    return user.username || user.name || user.email || user.uid || '';
  }

  window.AdminAuth = {
    isAuthenticated,
    signIn,
    signOut,
    requireAuth,
    currentUserLabel,
    get user() {
      return state.user;
    },
  };
})();
