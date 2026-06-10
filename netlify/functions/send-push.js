const webpush = require('web-push');

// Clés VAPID depuis les variables d'environnement Netlify
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@foedus-sanguis.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.handler = async function(event, context) {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': 'https://foedus-sanguis.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, x-foedus-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if(event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  // Vérification clé secrète simple (définie dans les env vars Netlify)
  const reqKey = event.headers['x-foedus-key'];
  if(reqKey !== process.env.FOEDUS_PUSH_SECRET) {
    return { statusCode: 401, headers, body: 'Unauthorized' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: 'Invalid JSON' }; }

  const { subscriptions, title, message, url } = body;
  if(!subscriptions || !subscriptions.length) {
    return { statusCode: 400, headers, body: 'No subscriptions' };
  }

  const payload = JSON.stringify({
    title: title || '⚔️ Foedus Sanguis',
    body:  message || 'Nouvelle notification',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   'foedus-war',
    url:   url || '/'
  });

  // Envoyer à tous les abonnés
  const results = await Promise.allSettled(
    subscriptions.map(function(sub) {
      return webpush.sendNotification(sub, payload);
    })
  );

  const sent     = results.filter(r => r.status === 'fulfilled').length;
  const failed   = results.filter(r => r.status === 'rejected').length;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent, failed })
  };
};
