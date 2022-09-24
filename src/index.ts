export async function handleRequest(request: Request, env: Bindings) {

  const requiredHeaders = [
    'x-dl-type',
    'x-dl-scope',
    'x-dl-key',
    'x-dl-limit',
    'x-dl-interval'
  ]

  const missingHeaders = requiredHeaders.filter(h => !request.headers.has(h))

  if (missingHeaders.length > 0) {
    return new Response(`{ "error": "Missing required headers: ${missingHeaders.join(', ')}"}`, { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const type = (request.headers.get('x-dl-type') as string).toLocaleLowerCase()
  if(type !== 'sliding' && type !== 'fixed') {
    return new Response(`{ "error": "Invalid x-dl-type: ${type}. Supported types are one of [sliding, fixed]"}`, { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const key = request.headers.get('x-dl-key') as string

  let id = env.RATE_LIMITER.idFromName(key)
  let rateLimiter = env.RATE_LIMITER.get(id)

  return rateLimiter.fetch('http://durable-limiter', {
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
}

const worker: ExportedHandler<Bindings> = { fetch: handleRequest };

export { RateLimiter } from "./ratelimiter";
export default worker;
