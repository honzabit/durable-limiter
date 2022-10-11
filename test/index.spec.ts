import { jest } from '@jest/globals'
import { handleRequest } from "@/index";


  const env = getMiniflareBindings();
  const ctx: ExecutionContext = { waitUntil: () => { }, passThroughOnException: () => { } }


test("sliding rate limit", async () => {
  
	const body =  {
		'type': 'sliding',
		'scope': 'http://a_domain', // rate-limiting using domain as scope
		'key': '10.10.10.10', // rate-limiting by IP
		'limit': '1',
		'interval': '300'
	}

  let rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })

  let res
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  expect(await res.json()).toStrictEqual(expect.objectContaining({
    error: expect.any(String),
    rate: expect.any(Number),
  }))

  body.key = '10.10.10.11'
  rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  body.scope = 'another.domain'
  rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

});

test("fixed rate limit", async () => {
  jest.useFakeTimers()

  let body = {
	'type': 'fixed',
	'scope': 'a_domain',
	'key': '10.10.10.10',
	'limit': '1',
	'interval': '15'
  }

  let rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })

  let res
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  type resBody = { resets: string }
  const resBody: resBody = await res.json()
  
  expect(resBody).toStrictEqual(expect.objectContaining({
    error: expect.any(String),
    resets: expect.any(String),
  }))

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);
  expect(res.headers.get('cf-cache-status')).toBe('HIT')
  expect(res.headers.get('x-dl-cache')).toBe('HIT')

  body.key = '10.10.10.11'
  rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  body.scope = 'another_domain'
  rlRequest = new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  setTimeout(async () => {
    res = await handleRequest(rlRequest, env, ctx);
    expect(res.status).toBe(200);
  }, 15000)

});
