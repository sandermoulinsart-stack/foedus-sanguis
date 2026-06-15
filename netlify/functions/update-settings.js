// ── Foedus Sanguis — update-settings.js ────────────────────────
// Modifie house_settings de façon sécurisée via service_role
// Vérifie les droits de l'appelant selon la clé modifiée

const SB_URL = 'https://xwtwmteqbmvwqjyicgal.supabase.co';

// Droits minimum requis par clé
const KEY_ROLES = {
  'rh_users':     ['admin', 'admin_assistant'],
  'rh_data':      ['admin', 'admin_assistant', 'baron'],
  'meta_units':   ['admin', 'admin_assistant', 'baron', 'officier', 'formation'],
  'hill_king':    null, // tout le monde (jeu public)
  'hill_bg':      ['admin', 'admin_assistant', 'baron', 'officier'],
  'hill_history': ['admin', 'admin_assistant', 'baron', 'officier'],
  'main':         ['admin', 'admin_assistant']
};

async function sbGet(table, params) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?select=*' + (params || ''), {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
    }
  });
  return r.json();
}

async function sbUpsert(table, data) {
  const r = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(data)
  });
  return r.status;
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-foedus-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  // ── Vérification clé secrète ──────────────────────────────────
  const reqKey = event.headers['x-foedus-key'];
  if (reqKey !== process.env.FOEDUS_PUSH_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Parser le body ────────────────────────────────────────────
  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { callerId, key, value } = body;

  if (!callerId || !key || value === undefined) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'callerId, key et value requis' }) };
  }

  // ── Vérifier que la clé est connue ───────────────────────────
  if (!(key in KEY_ROLES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Clé inconnue : ' + key }) };
  }

  // ── Vérifier le rôle de l'appelant ───────────────────────────
  const allowedRoles = KEY_ROLES[key];
  if (allowedRoles !== null) {
    const callers = await sbGet('membres', '&id=eq.' + encodeURIComponent(callerId));
    if (!callers || !callers.length) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Appelant introuvable' }) };
    }
    const callerRole = callers[0].role;
    if (!allowedRoles.includes(callerRole)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Droits insuffisants pour modifier ' + key }) };
    }
  }

  // ── Appliquer la modification ─────────────────────────────────
  const status = await sbUpsert('house_settings', { key, value });

  if (status === 201 || status === 200 || status === 204) {
    console.log('[update-settings] key:', key, 'par:', callerId);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, key }) };
  } else {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur mise à jour', status }) };
  }
};
