import { jest } from '@jest/globals'
import { handleRequest } from "@/index";


  const env = getMiniflareBindings();
  const ctx: ExecutionContext = { waitUntil: () => { }, passThroughOnException: () => { } }


test("sliding rate limit", async () => {
  
  const rlRequest = new Request("http://localhost", {
    headers: {
      'x-dl-type': 'sliding',
      'x-dl-scope': 'http://a_domain', // rate-limiting using domain as scope
      'x-dl-key': '10.10.10.10', // rate-limiting by IP
      'x-dl-limit': '1',
      'x-dl-interval': '300'
    }
  })

  let res
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  expect(await res.json()).toStrictEqual(expect.objectContaining({
    error: expect.any(String),
    rate: expect.any(Number),
  }))

  rlRequest.headers.set('x-dl-key', '10.10.10.11')

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  rlRequest.headers.set('x-dl-scope', 'http://another_domain')
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

});

test("fixed rate limit", async () => {
  jest.useFakeTimers()
  const rlRequest = new Request("http://localhost", {
    headers: {
      'x-dl-type': 'fixed',
      'x-dl-scope': 'a_domain',
      'x-dl-key': '10.10.10.10',
      'x-dl-limit': '1',
      'x-dl-interval': '15'
    }
  })

  let res
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  type resBody = { resets: string }
  const resBody: resBody = await res.json()
  
  expect(resBody).toStrictEqual(expect.objectContaining({
    error: expect.any(String),
    resets: expect.any(Number),
  }))

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);
  expect(res.headers.get('cf-cache-status')).toBe('HIT')

  rlRequest.headers.set('x-dl-key', '10.10.10.11')

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  rlRequest.headers.set('x-dl-scope', 'another_domain')
  
  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(200);

  res = await handleRequest(rlRequest, env, ctx);
  expect(res.status).toBe(429);

  setTimeout(async () => {
    res = await handleRequest(rlRequest, env, ctx);
    expect(res.status).toBe(200);
  }, 15000)

});
