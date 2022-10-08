export class RateLimiter {

    state: DurableObjectState
    env: Bindings

    constructor(state: DurableObjectState, env: Bindings) {
        this.state = state;
        this.env = env;
    }

	async alarm() {
		// const keys = await this.state.storage.
		let vals = await this.state.storage.list();
		let deleteList: { type: string, scope: string, ts_less_than: number}[] = []
		/**
		 * first run to populate deleteList
		 */
		vals.forEach((value: unknown, key: string) => {
			const [type, scope, dlkey, limit, interval, ts] = key.split('|');
			const now = Date.now()
			if(type == 'fixed') {
				if(deleteList.find((el) => { 
					return el.type == type && el.scope == scope && el.ts_less_than == Math.floor( now / 1000 / parseInt(interval)) - parseInt(interval)
				}) === undefined) {
					deleteList.push({ type: type, scope: scope, ts_less_than: Math.floor( now / 1000 / parseInt(interval)) - parseInt(interval) })
				}
			} else {
				if(deleteList.find((el) => { 
					return el.type == type && el.scope == scope && el.ts_less_than == Math.floor( now / 1000 / parseInt(interval)) - (parseInt(interval) * 2)
				}) === undefined) {
					deleteList.push({ type: type, scope: scope, ts_less_than: Math.floor( now / 1000 / parseInt(interval)) - (parseInt(interval) * 2) })
				}
			}
		})

		/**
		 * second run to delete keys
		 */
		vals.forEach((value: unknown, key: string) => {
			const [type, scope, dlkey, limit, interval, ts] = key.split('|');
			// delete all keys matching scope, type and having timestamp less than ts_less_than
			deleteList.forEach(async (el) => {
				if(el.type == type && el.scope == scope && parseInt(ts) < el.ts_less_than) {
					await this.state.storage.delete(key);
				}
			})
		})
	}
  
    async fetch(request: Request) {

	  let currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm == null) {
		/**
		 * run cleanup every 6h
		 */
        this.state.storage.setAlarm(Date.now() + (6 * 60 * 60 * 1000));
      }
	
      const type = request.headers.get('x-dl-type') as string
      const scope = request.headers.get('x-dl-scope') as string
      const key = request.headers.get('x-dl-key') as string
      const limit = parseInt(request.headers.get('x-dl-limit') as string)
      const interval = parseInt(request.headers.get('x-dl-interval') as string)

      const keyPrefix = `${type}|${scope}|${key}|${limit}|${interval}`

      const currentWindow = Math.floor(Date.now() / 1000 / interval)
      const distanceFromLastWindow = (Date.now() / 1000) % interval
      const currentKey = `${keyPrefix}|${currentWindow}`
      const previousKey = `${keyPrefix}|${currentWindow - 1}`

      const error_string = "rate-limited"

      const recordRequest = async() => {
          const curr = parseInt(await this.state.storage.get(currentKey) as string) || 0
          await this.state.storage.put(currentKey, curr+1)
      }
        
      const currentCount = parseInt(await this.state.storage.get(currentKey) as string) || 0
      const previousCount = parseInt(await this.state.storage.get(previousKey) as string) || 0

      let resBody: { error?: string, rate?: number, remaining?: number, resets?: number } = {}

      switch(type) {
        case 'sliding':
          const rate = (previousCount * (interval - distanceFromLastWindow) / interval) + currentCount  
          resBody.rate = rate
          if(rate >= limit) {
            resBody.error = error_string
          }
          break;
        case 'fixed':
          resBody.resets = (currentWindow*interval)+interval
          if(currentCount >= limit) {
            resBody.error = error_string
          } else {
            resBody.remaining = (limit-currentCount) - 1 // -1 because we're recording this request *after* the check
            resBody.resets = (currentWindow*interval)+interval
          }
          break;
        default: {
          throw new Error(`Unknown rate limiter type: ${type}`)
        }
      }

      let headers:Headers = new Headers()
      headers.set('Content-Type', 'application/json')

      if(! resBody.error) {
        await recordRequest()
        return new Response(JSON.stringify(resBody), { status: 200, headers: headers })
      } else {
        let exp
        if(type == 'fixed' && resBody.resets) {
          exp = `${Math.floor(resBody.resets - (Date.now() / 1000))}`
          headers.set('Expires', new Date(resBody.resets * 1000).toUTCString())
        } else if(type == 'sliding' && resBody.rate && resBody.rate > limit) {
          exp = Math.floor(((resBody.rate / limit) - 1) * interval)
          headers.set('Expires', new Date((Date.now()) + (1000 * exp)).toUTCString())
        }
        headers.set('Cache-Control', `public, max-age=${exp}, s-maxage=${exp}, must-revalidate`)
      }

      return new Response(JSON.stringify(resBody), { status: 429, headers: headers })
    }

}
