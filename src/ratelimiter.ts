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

      const recordRequest = async() => {
          const curr = parseInt(await this.state.storage.get(currentKey) as string) || 0
          await this.state.storage.put(currentKey, curr+1)
      }
        
      const currentCount = parseInt(await this.state.storage.get(currentKey) as string) || 0
      const previousCount = parseInt(await this.state.storage.get(previousKey) as string) || 0

      let resBody: { error?: string, rate?: number, remaining?: number, resets?: number } = {}

      if(type === 'sliding') {
        const rate = (previousCount * (interval - distanceFromLastWindow) / interval) + currentCount
        resBody.rate = rate
        if(rate >= limit) {
          resBody.error = "rate-limited"
        }
      } else if(type === 'fixed') {
        resBody.resets = (currentWindow*interval)+interval
        if(currentCount >= limit) {
          resBody.error = "rate-limited"
        } else {
          resBody.remaining = (limit-currentCount) - 1 // -1 because we're recording this request *after* the check
          resBody.resets = (currentWindow*interval)+interval
        }
      }

      if(! resBody.error) {
        await recordRequest()
        return new Response(JSON.stringify(resBody), { status: 200, headers: { "Content-Type": "application/json" } })
      }

      return new Response(JSON.stringify(resBody), { status: 429, headers: { "Content-Type": "application/json" } })
    }

}
