// ── Foedus Sanguis — delete-membre.js ──────────────────────────
// Supprime un membre de façon sécurisée via service_role
// Seuls admin et admin_assistant peuvent appeler cette fonction

const SB_URL = 'https://xwtwmteqbmvwqjyicgal.supabase.co';

async function sbServiceGet(table, params) {
  const url = SB_URL + '/rest/v1/' + table + '?select=*' + (params || '');
  const r = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
    }
  });
  return r.json();
}

async function sbServiceDelete(table, id) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
      'Prefer': 'return=minimal'
    }
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

  const { callerId, targetId } = body;

  if (!callerId || !targetId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'callerId et targetId requis' }) };
  }

  // ── Vérifier le rôle de celui qui appelle ────────────────────
  const callers = await sbServiceGet('membres', '&id=eq.' + encodeURIComponent(callerId));
  if (!callers || !callers.length) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Appelant introuvable' }) };
  }
  const caller = callers[0];
  const allowedRoles = ['admin', 'admin_assistant', 'baron', 'officier'];
  if (!allowedRoles.includes(caller.role)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Droits insuffisants' }) };
  }

  // ── Vérifier la cible ─────────────────────────────────────────
  const targets = await sbServiceGet('membres', '&id=eq.' + encodeURIComponent(targetId));
  if (!targets || !targets.length) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Membre introuvable' }) };
  }
  const target = targets[0];

  // Protection AdminFS
  if (target.username && target.username.toLowerCase() === 'adminfs') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Le compte AdminFS ne peut pas être supprimé' }) };
  }

  // Seul admin peut supprimer un admin
  if (target.role === 'admin' && caller.role !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seul un Admin peut supprimer un compte Admin' }) };
  }

  // Seul admin/admin_assistant peut supprimer un admin_assistant
  if (target.role === 'admin_assistant' && !['admin', 'admin_assistant'].includes(caller.role)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seul un Admin ou Admin Assistant peut supprimer ce compte' }) };
  }

  // ── Supprimer ─────────────────────────────────────────────────
  const status = await sbServiceDelete('membres', targetId);

  if (status === 204 || status === 200) {
    console.log('[delete-membre] Supprimé:', target.username, 'par:', caller.username);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, deleted: target.username }) };
  } else {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur suppression en base', status }) };
  }
};
