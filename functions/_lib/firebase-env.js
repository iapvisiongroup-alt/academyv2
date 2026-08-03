const FIREBASE_API_KEY = 'AIzaSyDVD2Sbu7nVbFfVkgujMcgOC_S0oDla-zQ';
const FIREBASE_PROJECT_ID = 'appacademy-fc66d';
const FIREBASE_APP_ID = 'appiapvision';

export function hydrateFirebaseEnv(env) {
  let serviceAccount = {};

  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
        : env.FIREBASE_SERVICE_ACCOUNT;
    } catch {
      console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT no contiene JSON válido.');
    }
  }

  const resolved = {
    FIREBASE_API_KEY: env.FIREBASE_API_KEY || FIREBASE_API_KEY,
    FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID || serviceAccount.project_id || FIREBASE_PROJECT_ID,
    FIREBASE_APP_ID: env.FIREBASE_APP_ID || FIREBASE_APP_ID,
    FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL || serviceAccount.client_email || '',
    FIREBASE_PRIVATE_KEY: env.FIREBASE_PRIVATE_KEY || serviceAccount.private_key || '',
  };

  Object.entries(resolved).forEach(([key, value]) => {
    if (!env[key] && value) env[key] = value;
  });

  return env;
}
