import { config, redirectStatus } from '@/types'

export async function handleRequest(request: Request, env: Bindings, ctx: ExecutionContext) {

	let requestJson: config
	try {
		requestJson = await request.clone().json()
	} catch (e: any) {
		console.debug(e)
		return new Response(`Invalid JSON: ${e.message}`, { status: 400 })
	}

	const fakeDomain = 'http://durable-limiter.net'

	try {
	let id = env.RATE_LIMITER.idFromName(requestJson.key)
	let rateLimiter = env.RATE_LIMITER.get(id)

	let cache = await caches.open('durable-limiter');

	const rlRequest = new Request(fakeDomain, { method: 'POST', body: JSON.stringify(requestJson) })

	let cacheKey: string = fakeDomain
	for (const hp of Object.entries(requestJson)) {
		cacheKey += `/${hp[0]}:${hp[1]}`
	}

	let cached = await cache.match(cacheKey);
	let response: Response

	if (undefined === cached) {
		response = await rateLimiter.fetch(rlRequest)
		
		if (undefined === response) {
			return new Response('Something went terribly wrong while communicating with the DO', { status: 500 })
		}

		if (response.status == 429) {
			/** 
			 * https://www.rfc-editor.org/rfc/rfc6585 points that responses with 429 MUST NOT be cached
			 * so, we change the status code to 200 in order to cache the response and then return the 
			 * original status code
			 */
			//ctx.waitUntil(cache.put(cacheKey, new Response(response.body, { status: 200, headers: response.headers })))
			ctx.waitUntil(cache.put(cacheKey, new Response(response.clone().body, { status: 200, headers: response.headers })))
			response = new Response(response.body, { status: 429, headers: response.headers })
		} else if(redirectStatus.some((rs) => { rs == response.status })) {
			ctx.waitUntil(cache.put(cacheKey, response.clone()));
		}
	} else {
		response = cached
		if(cached.status == 200) {
			response = new Response(cached.body, { status: 429, headers: cached.headers });
		}
		response.headers.set('x-dl-cache', 'HIT')
	}

	return response
} catch (e: any) {
	console.debug(e.stack)
	return new Response(`Something went terribly wrong: ${e.message}`, { status: 500 })
}
}

const worker: ExportedHandler<Bindings> = { fetch: handleRequest };

export { RateLimiter } from "./ratelimiter";
export default worker;
