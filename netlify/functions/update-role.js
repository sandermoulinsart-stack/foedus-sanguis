// ── Foedus Sanguis — update-role.js ────────────────────────────
// Change le rôle d'un membre de façon sécurisée via service_role
// Vérifie les droits de l'appelant côté serveur

const SB_URL = 'https://xwtwmteqbmvwqjyicgal.supabase.co';

const ROLE_LEVEL = {
  admin: 8, admin_assistant: 7, baron: 6, officier: 5,
  evenement: 4, recrutement: 4, formation: 4,
  chef_groupe: 3, garde_sanguin: 2, responsable_gdoc: 3, membre: 1, recrue: 0
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

async function sbPatch(table, id, data) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
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

  const { callerId, targetId, newRole } = body;

  if (!callerId || !targetId || !newRole) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'callerId, targetId et newRole requis' }) };
  }

  // ── Vérifier l'appelant ───────────────────────────────────────
  const callers = await sbGet('membres', '&id=eq.' + encodeURIComponent(callerId));
  if (!callers || !callers.length) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Appelant introuvable' }) };
  }
  const caller = callers[0];
  const callerRole = caller.role;

  // ── Vérifier la cible ─────────────────────────────────────────
  const targets = await sbGet('membres', '&id=eq.' + encodeURIComponent(targetId));
  if (!targets || !targets.length) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Membre introuvable' }) };
  }
  const target = targets[0];
  const targetRole = target.role;

  // ── Règles de sécurité ────────────────────────────────────────

  // Seul admin peut modifier un admin
  if (targetRole === 'admin' && callerRole !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seul un Admin peut modifier un compte Admin' }) };
  }

  // Seul admin/admin_assistant peut modifier un admin_assistant
  if (targetRole === 'admin_assistant' && !['admin', 'admin_assistant'].includes(callerRole)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seul un Admin ou Admin Assistant peut modifier ce compte' }) };
  }

  // Seul admin peut attribuer le rôle admin
  if (newRole === 'admin' && callerRole !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seul un Admin peut attribuer le rôle Admin' }) };
  }

  // admin_assistant et baron peuvent attribuer admin_assistant
  if (newRole === 'admin_assistant' && !['admin', 'admin_assistant', 'baron'].includes(callerRole)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Droits insuffisants pour attribuer ce rôle' }) };
  }

  // L'appelant doit avoir un niveau >= à la cible (ne peut pas modifier quelqu'un de plus haut)
  if ((ROLE_LEVEL[callerRole] || 0) < (ROLE_LEVEL[targetRole] || 0) && callerRole !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Vous ne pouvez pas modifier un membre de rang supérieur' }) };
  }

  // ── Appliquer le changement ───────────────────────────────────
  const status = await sbPatch('membres', targetId, { role: newRole });

  if (status === 204 || status === 200) {
    console.log('[update-role]', caller.username, '→', target.username, ':', targetRole, '→', newRole);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, oldRole: targetRole, newRole }) };
  } else {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur mise à jour en base', status }) };
  }
};
