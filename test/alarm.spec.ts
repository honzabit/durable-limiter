import { it, beforeEach, expect } from "vitest"
import { getStorageKeyPrefix } from '../src/ratelimiter';
import { config } from '../src/types';

const describe = setupMiniflareIsolatedStorage();

const env = getMiniflareBindings()
const key = '127.0.0.1'
const id = env.RATE_LIMITER.idFromName(key)

const config: config = {
	scope: '/v1/auth/send-verification-email',
	type: 'fixed',
	key: key,
	limit: 1,
	interval: 60
}

const getBucket = (ts: number, interval: number): number => {
	return Math.floor(ts / 1000 / interval)
}

describe('Alarm', () => {
    let storage: DurableObjectStorage

    beforeEach(async () => {
      storage = await getMiniflareDurableObjectStorage(id);
    });

	it('should expire keys previous to 1 interval when [fixed] algo is used', async () => {
		config.type = 'fixed'
		/**
		 * set "current" to 1 interval in the past because I can't use fake date inside the alarm
		 */

		const rl = env.RATE_LIMITER.get(id)
		const currentWindow = getBucket(Date.now(), config.interval) - 1
		const windowOfAlarm = currentWindow + 1
		const storageKey = `${getStorageKeyPrefix(config)}|${currentWindow}`

		storage.put(storageKey, 1)

		const values = await storage.list()
		expect(values.size).toBe(1)
		expect(values.get(storageKey)).toBe(1)

		const newWindow = `${getStorageKeyPrefix(config)}|${windowOfAlarm}`
		storage.put(newWindow, 1)

		await rl.fetch("http://localhost/", { method: "POST", body: JSON.stringify(config) });
		await flushMiniflareDurableObjectAlarms()
		const values2 = await storage.list()
		expect(values2.size).toBe(1)
		expect(values2.get(newWindow)).toBe(1)
    });

	it('should expire keys previous to 2 intervals when [sliding] algo is used', async () => {
		config.type = 'sliding'
		/**
		 * set "current" to 1 interval in the past because I can't use fake date inside the alarm
		 */
		const rl = env.RATE_LIMITER.get(id)
		const minusTwoWindowsBucket = getBucket(Date.now(), config.interval) - 2
		const minusTwoWindows = `${getStorageKeyPrefix(config)}|${minusTwoWindowsBucket}`
		const minusOneWindow = `${getStorageKeyPrefix(config)}|${minusTwoWindowsBucket + 1}`
		const thisWindow = `${getStorageKeyPrefix(config)}|${minusTwoWindowsBucket + 2}`

		storage.put(minusTwoWindows, 1)
		const values = await storage.list()
		expect(values.size).toBe(1)
		expect(values.get(minusTwoWindows)).toBe(1)

		/* set new key and trigger alarm */
		storage.put(minusOneWindow, 1)
		await rl.fetch("http://localhost/", { method: "POST", body: JSON.stringify(config) });
		await flushMiniflareDurableObjectAlarms()

		const values2 = await storage.list()
		expect(values2.size).toBe(2)
		expect(values2.get(thisWindow)).toBe(1)
		expect(values2.get(minusOneWindow)).toBe(1)
		expect(values2.get(minusTwoWindows)).toBe(undefined)

		await rl.fetch("http://localhost/", { method: "POST", body: JSON.stringify(config) });
		await flushMiniflareDurableObjectAlarms()
		const values3 = await storage.list()
		expect(values3.size).toBe(2)
		expect(values3.get(thisWindow)).toBe(1)
		expect(values3.get(minusOneWindow)).toBe(1)
		expect(values2.get(minusTwoWindows)).toBe(undefined)
    });

});