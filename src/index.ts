import { config } from '@/types'

export async function handleRequest(request: Request, env: Bindings, ctx: ExecutionContext) {

	let requestJson: config
	try {
		requestJson = await request.clone().json()
	} catch (e: any) {
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
			ctx.waitUntil(cache.put(cacheKey, response.clone()));
		} else {
			response = cached
		}

		return response
	} catch (e: any) {
		return new Response(`Something went terribly wrong: ${e.message}`, { status: 500 })
	}
}

const worker: ExportedHandler<Bindings> = { fetch: handleRequest };

export { RateLimiter } from "./ratelimiter";
export default worker;
