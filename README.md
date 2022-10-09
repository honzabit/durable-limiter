Rate Limiter - built for [Cloudflare Workers](https://developers.cloudflare.com/workers/), using [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)

## Features
- [x] Supports [fixed or sliding window algorithms](https://www.quinbay.com/blog/understanding-rate-limiting-algorithms)
- [x] Scoped rate-limiting
- [x] Responses provide usage information
- [x] Caching 
- [x] Cleanup of stale DO data using [alarm](https://developers.cloudflare.com/workers/learning/using-durable-objects/#alarms-in-durable-objects)
- [x] Custom block time  
- [ ] Tested in production (well, not actually)


## How to use
You can use it as a subworker [as described here](https://developers.cloudflare.com/workers/platform/bindings/about-service-bindings/).

## What about pricing? How it compares with CF's own rate-limiter?
Well, it all depends in the use-case. You can check out the [cost calculator](https://dl-cost-calculator.dev0x.workers.dev/).

## Headers
* `x-dl-type`: type can be one of `sliding` or `fixed` and describes the algorithm that will be used.
* `x-dl-scope`: the value of this header is used as the rate-limit scope.
* `x-dl-key`: the key is the client information, can be an IP (most of the time), or a network, a username, or even a user-agent. In general, feel free to use whatever you like.
* `x-dl-limit`: the value of this header provides the request limit (e.g. 10).
* `x-dl-interval`: the interval (in seconds) upon which all calculations are based.
* `x-dl-block-duration`: this is an optional header for specifying a custom block time (if ommitted, the interval is used instead)

## Responses
Response __status__ will be one of:
* `200`, meaning that the request __should not be__ rate-limited
* `429`, meaning that the request __should be__ rate-limited

Response __body__ depends on the type of the algorithm used and the status.   

The `sliding` type will produce the following bodies:
* on `200` status (not rate-limited):
```json
{
    "rate": {number, rate of the incoming requests}
}
```

* on `429` status (rate-limited):
```json
{
	"rate": {number, rate of the incoming requests},
	"error": "rate-limited"
}
```   

The `fixed` type will respond with the following bodies:
* on `200` status (not rate-limited):
```json
{
	"resets": {number, seconds since epoch},
	"remaining": {number, remaining requests until rate-limiting}
}
```   

* on `429` status (rate-limited):
```json
{
	"resets": {number, seconds since epoch},
	"error": "rate-limited"
}
```