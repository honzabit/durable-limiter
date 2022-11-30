import type { config, Facts } from '@/types';

export const getStorageKeyPrefix = (config: config):string => {
	return `${config.type}|${config.scope}|${config.key}|${config.limit}|${config.interval}`
}

export class RateLimiter {
    state: DurableObjectState;
    env: Bindings;

    constructor(state: DurableObjectState, env: Bindings) {
        this.state = state;
        this.env = env;
    }

    async alarm(): Promise<void> {
        const vals = await this.state.storage.list();
        const deleteList: { type: string; scope: string; bucket_before: number }[] = [];
        /**
         * first run to populate deleteList
         */
        vals.forEach((_value: unknown, key: string) => {
            const [type, scope, _dlkey, _limit, interval, _ts] = key.split('|');
			const intervalAsNumber = parseInt(interval);

            const currentBucket = Math.floor(Date.now() / 1000 / intervalAsNumber);
            if (type === 'fixed') {
				const bucket_before = currentBucket
                if (
                    deleteList.find(el => {
                        return el.type === type && el.scope === scope && el.bucket_before === bucket_before
                    }) === undefined
                ) {
                    deleteList.push({
                        type: type,
                        scope: scope,
                        bucket_before: bucket_before
                    });
                }
            } else {
				const bucket_before = currentBucket - 1
                if (
                    deleteList.find(el => {
                        return el.type === type && el.scope === scope && el.bucket_before === bucket_before;
                    }) === undefined
                ) {
                    deleteList.push({
                        type: type,
                        scope: scope,
                        bucket_before: bucket_before
                    });
                }
            }
        });

        /**
         * second run to delete keys
         */
        vals.forEach((_value: unknown, key: string) => {
            const [type, scope, _dlkey, _limit, _interval, bucket] = key.split('|');
            /**
             * delete all keys matching scope, type and having timestamp less than ts_less_than
             */
            deleteList.forEach(async el => {
                if (el.type === type && el.scope === scope && parseInt(bucket) < el.bucket_before) {
                    await this.state.storage.delete(key);
                }
            });
        });
    }

    async fetch(request: Request): Promise<Response> {
        const currentAlarm = await this.state.storage.getAlarm();
        if (currentAlarm == null) {
            /**
             * run cleanup every 6h
             */
            this.state.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);
        }

        let config: config;
        try {
            config = await request.clone().json();
        } catch (e: any) {
            console.debug(e);
            return new Response(`This shouldn't happen. Got invalid json`, { status: 400 });
        }

        const keyPrefix = getStorageKeyPrefix(config);

        const currentWindow = Math.floor(Date.now() / 1000 / config.interval);
        const distanceFromLastWindow = (Date.now() / 1000) % config.interval;
        const currentKey = `${keyPrefix}|${currentWindow}`;
        const previousKey = `${keyPrefix}|${currentWindow - 1}`;

        const error_string = 'rate-limited';

        const recordRequest = async (): Promise<void> => {
            const curr = parseInt((await this.state.storage.get(currentKey)) as string) || 0;
            await this.state.storage.put(currentKey, curr + 1);
        };

        const currentCount = parseInt((await this.state.storage.get(currentKey)) as string) || 0;
        const previousCount = parseInt((await this.state.storage.get(previousKey)) as string) || 0;

        const facts: Facts = {};

        switch (config.type) {
            case 'sliding': {
                facts.rate = (previousCount * (config.interval - distanceFromLastWindow)) / config.interval + currentCount;
                if (facts.rate >= config.limit) {
                    facts.error = error_string;
                }
                break;
			}
            case 'fixed': {
                facts.resets = Number(currentWindow * config.interval + config.interval);
                facts.remaining = config.limit - currentCount;
                if (facts.remaining <= 0) {
                    facts.error = error_string;
                    facts.remaining = undefined;
                }
                break;
			}
            default: {
                break;
            }
        }

        const headers: Headers = new Headers();
        headers.set('Content-Type', 'application/json');

        if (facts.error !== error_string) {
            await recordRequest();
            return new Response(JSON.stringify(facts), { status: 200, headers: headers });
        } else {
            let exp = 0;

            if (config.type === 'fixed') {
                exp = Math.floor(facts.resets - Date.now() / 1000);
                headers.set('Expires', new Date(Date.now() + exp * 1000).toUTCString());
            } else if (config.type === 'sliding' && facts.rate > config.limit) {
                exp = Math.floor((facts.rate / config.limit - 1) * config.interval);
                headers.set('Expires', new Date(Date.now() + 1000 * exp).toUTCString());
            }
            headers.set('Cache-Control', `public, max-age=${exp}, s-maxage=${exp}, must-revalidate`);
        }

        return new Response(JSON.stringify(facts), { status: 200, headers: headers });
    }
}
