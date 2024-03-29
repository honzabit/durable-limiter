Rate Limiter - built for [Cloudflare Workers](https://developers.cloudflare.com/workers/), using [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)

## Features
- [x] Supports [fixed or sliding window algorithms](https://www.quinbay.com/blog/understanding-rate-limiting-algorithms)
- [x] Scoped rate-limiting
- [x] Caching 
- [x] Cleanup of stale DO data using [alarm](https://developers.cloudflare.com/workers/learning/using-durable-objects/#alarms-in-durable-objects)
- [x] Responses provide all information needed to take actions (or not)
- [ ] Tested in production (well, not actually)

## FAQ

### How to use
You can use it as a subworker [as described here](https://developers.cloudflare.com/workers/platform/bindings/about-service-bindings/).

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/honzabit/durable-limiter)

### But it doesn't rate limit anything
Yeah, that's the sad truth. The code is there to decide whether or not a request should be rate-limited, but currently, it just outputs the results in a JSON response. The reason is that this is how it's being used as part of another project I'm working on. That said, I think it's a good starting point as it would require minimal changes from you to send the right responses back.

### What about pricing? How does it compare with CF's own rate-limiter?
Well, it all depends on the use case. You can check out the [cost calculator](https://dl-cost-calculator.dev0x.workers.dev/).


## Description of JSON Body (usage)
* `type`: type can be one of `sliding` or `fixed` and describes the algorithm that will be used.
* `scope`: the value of this header is used as the rate-limit scope.
* `key`: the key is the client information, which can be an IP (most of the time), a network, a username, or even a user-agent. In general, feel free to use whatever you like.
* `limit`: the value of this header provides the request limit (e.g. 10).
* `interval`: the interval (in seconds) upon which all calculations are based.

## Responses
Response __status__ will be one of:
* `200`, meaning that the request was processed without problems
* `400`, JSON input error
* `500`, any other error, info can be found in the response body

Response __body__ on successful requests depends on the type of algorithm used and the outcome.

If the request __should be rate-limited__, you would find an `error` property, with a value of `rate-limited`, if not, depending on the algorithm used, you will find quota information:


* The `sliding` type might return one of the two following bodies:
```json
{
    "rate": "number, rate of the incoming requests"
}
```
or
```json
{
    "rate": "number, rate of the incoming requests",
    "error": "rate-limited"
}
```   

* The `fixed` type might return one of the following bodies:
```json
{ 
    "resets": "number, seconds since epoch",
    "remaining": "number, remaining requests until rate-limiting"
}
```   
or
```json
{
    "resets": "number, seconds since epoch",
    "error": "rate-limited"
}
```
