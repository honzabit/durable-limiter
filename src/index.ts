export async function handleRequest(request: Request, env: Bindings, ctx: ExecutionContext) {

  const requiredHeaders = [
    'x-dl-type',
    'x-dl-scope',
    'x-dl-key',
    'x-dl-limit',
    'x-dl-interval'
  ]

  const fakeDomain = 'http://durable-limiter.net'

  const missingHeaders = requiredHeaders.filter(h => !request.headers.has(h))

  if (missingHeaders.length > 0) {
    return new Response(`{ "error": "Missing required headers: ${missingHeaders.join(', ')}"}`, { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const type = (request.headers.get('x-dl-type') as string).toLocaleLowerCase()

  if (type !== 'sliding' && type !== 'fixed') {
    return new Response(`{ "error": "Invalid x-dl-type: ${type}. Supported types are one of [sliding, fixed]"}`, { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const key = request.headers.get('x-dl-key') as string

  let id = env.RATE_LIMITER.idFromName(key)
  let rateLimiter = env.RATE_LIMITER.get(id)

  let cache = await caches.open('durable-limiter');

  const rlRequest = new Request(fakeDomain, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-dl-type': request.headers.get('x-dl-type') as string,
      'x-dl-scope': request.headers.get('x-dl-scope') as string,
      'x-dl-key': request.headers.get('x-dl-key') as string,
      'x-dl-limit': request.headers.get('x-dl-limit') as string,
      'x-dl-interval': request.headers.get('x-dl-interval') as string
    }
  })

  let cacheKey: string = fakeDomain
  for (const hp of rlRequest.headers.entries()) {
    cacheKey += `/${hp[0]}:${hp[1]}`
  }

  let response = await cache.match(cacheKey);

  if (!response) {
    response = await rateLimiter.fetch(rlRequest)
    if (response.status == 429) {
      /** 
       * https://www.rfc-editor.org/rfc/rfc6585 points that responses with 429 MUST NOT be cached
       * so, we change the status code to 200 in order to cache the response and then return the 
       * original status code
       */
      response = new Response(response.body, { status: 200, headers: response.headers });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      response = new Response(response.body, { status: 429, headers: response.headers });
    }
  } else {
    response = new Response(response.body, { status: 429, headers: response.headers });
    response.headers.set('x-dl-cache', 'HIT')
  }

  return response
}

const worker: ExportedHandler<Bindings> = { fetch: handleRequest};

export { RateLimiter } from "./ratelimiter";
export default worker;
