export class RateLimiter {

    state: DurableObjectState
    env: Bindings

    constructor(state: DurableObjectState, env: Bindings) {
        this.state = state;
        this.env = env;
    }
  
    async fetch(request: Request) {
      const type = request.headers.get('x-dl-type') as string
      const scope = request.headers.get('x-dl-scope') as string
      const key = request.headers.get('x-dl-key') as string
      const limit = parseInt(request.headers.get('x-dl-limit') as string)
      const interval = parseInt(request.headers.get('x-dl-interval') as string)

      const keyPrefix = `${scope}:${key}`

      const currentWindow = Math.floor(Date.now() / 1000 / interval)
      const distanceFromLastWindow = (Date.now() / 1000) % interval
      const currentKey = `${keyPrefix}:${currentWindow}`
      const previousKey = `${keyPrefix}:${currentWindow - 1}`

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
          headers.set('Expires', new Date(resBody.resets*1000).toUTCString())
        } else if(type == 'sliding' && resBody.rate && resBody.rate > limit) {
          exp = Math.floor(((resBody.rate / limit) - 1) * interval)
          headers.set('Expires', new Date((Date.now()) + (1000 * exp)).toUTCString())
        }
        headers.set('Cache-Control', `public, max-age=${exp}, s-maxage=${exp}, must-revalidate`)
      }

      return new Response(JSON.stringify(resBody), { status: 429, headers: headers })
    }

}
