// Edge Function "turn": entrega claves temporales del servidor TURN de
// Cloudflare para las salas en línea del juego escondido. La clave de
// Cloudflare vive solo en los secretos de Supabase (Edge Functions > Secrets):
// CF_TURN_KEY_ID y CF_TURN_API_TOKEN. El juego recibe usuario y contraseña
// que vencen solos (TTL), nunca la clave.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 12 h: más que la partida más larga (las claves se renuevan durante la conexión)
const TTL = 43200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const id = Deno.env.get('CF_TURN_KEY_ID');
  const token = Deno.env.get('CF_TURN_API_TOKEN');
  if (!id || !token) return json({ error: 'sin configurar' }, 500);
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL }),
  });
  if (!r.ok) return json({ error: `cloudflare ${r.status}` }, 502);
  const { iceServers } = await r.json();
  return json({ iceServers });
});
