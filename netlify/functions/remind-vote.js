const webpush = require('web-push');

const SB_URL = 'https://xwtwmteqbmvwqjyicgal.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dHdtdGVxYm12d3FqeWljZ2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDM5MjksImV4cCI6MjA5NTYxOTkyOX0.wYU_YGFZIWXvEUwemRWycTK0vcrHRfSEpUzYL2ESE7E';

async function sbGet(table, params){
  var url = SB_URL+'/rest/v1/'+table+'?select=*'+(params||'');
  var r = await fetch(url, {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
  return r.json();
}

exports.handler = async function(event, context){
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-foedus-key',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  // Vérification clé secrète
  const reqKey = event.headers['x-foedus-key'];
  if(reqKey !== process.env.FOEDUS_PUSH_SECRET){
    return { statusCode: 401, headers, body: JSON.stringify({error:'Unauthorized'}) };
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

  // 1. Récupérer les guerres ouvertes
  var wars = await sbGet('vote_wars', '&status=eq.open');
  if(!wars || !wars.length){
    return { statusCode: 200, headers, body: JSON.stringify({message:'No open wars', sent:0}) };
  }

  // 2. Récupérer tous les membres actifs
  var membres = await sbGet('membres', '&status=eq.actif');

  // 3. Récupérer toutes les subscriptions push
  var subs = await sbGet('push_subscriptions');

  // 4. Pour chaque guerre ouverte, trouver les membres qui n'ont pas voté
  var totalSent = 0;
  var totalFailed = 0;

  for(var w of wars){
    var votes = w.votes || {};
    // Membres qui n'ont pas voté
    var nonVoters = membres.filter(function(m){
      return !votes[m.id];
    });

    if(!nonVoters.length) continue;

    // Trouver les subscriptions de ces membres
    var targetSubs = subs.filter(function(s){
      return nonVoters.some(function(m){ return m.id === s.membre_id; });
    });

    if(!targetSubs.length) continue;

    var payload = JSON.stringify({
      title: '⚔️ Vote en attente — ' + w.title,
      body: 'Vous n\'avez pas encore indiqué votre présence pour cette guerre. Votez maintenant !',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'foedus-remind-'+w.id,
      url: '/'
    });

    var results = await Promise.allSettled(
      targetSubs.map(function(sub){
        return webpush.sendNotification(
          {endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth}},
          payload
        );
      })
    );

    totalSent   += results.filter(r => r.status === 'fulfilled').length;
    totalFailed += results.filter(r => r.status === 'rejected').length;
  }

  console.log('[remind-vote] Sent:', totalSent, 'Failed:', totalFailed);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent: totalSent, failed: totalFailed })
  };
};
