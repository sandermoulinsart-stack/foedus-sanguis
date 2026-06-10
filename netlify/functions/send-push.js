const webpush = require('web-push');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-foedus-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if(event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  // Vérification clé secrète
  const reqKey = event.headers['x-foedus-key'];
  if(reqKey !== process.env.FOEDUS_PUSH_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({error:'Unauthorized'}) };
  }

  // Vérifier les clés VAPID
  if(!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({error:'VAPID keys missing'}) };
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@foedus-sanguis.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({error:'VAPID init failed: '+e.message}) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({error:'Invalid JSON'}) }; }

  const { subscriptions, title, message, url } = body;
  if(!subscriptions || !subscriptions.length) {
    return { statusCode: 400, headers, body: JSON.stringify({error:'No subscriptions', sent:0}) };
  }

  const payload = JSON.stringify({
    title: title || '⚔️ Foedus Sanguis',
    body:  message || 'Nouvelle notification',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   'foedus-war',
    url:   url || '/'
  });

  const results = await Promise.allSettled(
    subscriptions.map(function(sub) {
      return webpush.sendNotification(sub, payload);
    })
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message);

  console.log('[Push] Sent:', sent, 'Failed:', failed, 'Errors:', errors);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent, failed, errors })
  };
};
