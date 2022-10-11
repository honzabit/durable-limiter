import type { config } from '@/types'

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
	
	let config: config
	try {
		config = await request.clone().json()
	} catch (e: any) {
		console.debug(e)
		return new Response(`This shouldn't happen. Got invalid json`, { status: 400 })
	}


      const keyPrefix = `${config.type}|${config.scope}|${config.key}|${config.limit}|${config.interval}`

      const currentWindow = Math.floor(Date.now() / 1000 / config.interval)
      const distanceFromLastWindow = (Date.now() / 1000) % config.interval
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

	  switch(config.type) {
        case 'sliding':
          const rate = (previousCount * (config.interval - distanceFromLastWindow) / config.interval) + currentCount  
          resBody.rate = rate
          if(rate >= config.limit) {
            resBody.error = error_string
          }
          break;
        case 'fixed':
          resBody.resets = (currentWindow * config.interval) + config.interval
          if(currentCount >= config.limit) {
            resBody.error = error_string
          } else {
            resBody.remaining = (config.limit-currentCount) - 1 // -1 because we're recording this request *after* the check
            resBody.resets = (currentWindow * config.interval) + config.interval
          }
          break;
        default: {
          break;
        }
      }

      let headers:Headers = new Headers()
      headers.set('Content-Type', 'application/json')

      if(! resBody.error) {
        await recordRequest()
        return new Response(JSON.stringify(resBody), { status: 200, headers: headers })
      } else {
        let exp: number = 0
		if(undefined === config.action) {
			config.action = { type: 'block', for: config.interval }
		}

        if(config.type == 'fixed' && resBody.resets) {
          exp = (config.action.type == "block" && config.action.for)? config.action.for : Math.floor(resBody.resets - (Date.now() / 1000))
          headers.set('Expires', new Date(Date.now() + (exp * 1000)).toUTCString())
        } else if(config.type == 'sliding' && resBody.rate && resBody.rate > config.limit) {
          exp = (config.action.type == "block" && config.action.for)? config.action.for : Math.floor(((resBody.rate / config.limit) - 1) * config.interval)
          headers.set('Expires', new Date((Date.now()) + (1000 * exp)).toUTCString())
        }
        headers.set('Cache-Control', `public, max-age=${exp}, s-maxage=${exp}, must-revalidate`)
      }

	  const status = (config.action.type == "block")? 429 : config.action.status
      return new Response(JSON.stringify(resBody), { status: status, headers: headers })
    }

}
