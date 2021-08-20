import {
    Client as MemcachedClient,
    ClientOptions,
} from "memjs";
import type { QMemCachedConfig } from "../config";
import type { QLog } from "../logs";
import type { QDataCache } from "./data-provider";

export class MemjsDataCache implements QDataCache {
    memcached: MemcachedClient;
    log: QLog;

    constructor(log: QLog, config: QMemCachedConfig) {
        this.log = log;
        const options: ClientOptions = {
            logger: {
                log: () => {
                },
            },
            retries: 0, // don't retry
            expires: 0, // keepForever
            timeout: 0.1, // 100ms
            conntimeout: 0.2, // twice of timeout
            keepAlive: true,
            keepAliveDelay: 15,
        } as ClientOptions;
        this.memcached = MemcachedClient.create(config.server, options);
    }

    async get(hashedKey: string): Promise<unknown> {
        return new Promise((resolve) => {
            this.memcached.get(hashedKey, (err, data) => {
                if (!err) {
                    try {
                        const value = data ? JSON.parse(data.toString()) : null;
                        this.log.debug("GET", hashedKey);
                        resolve(value);
                    } catch (e) {
                        this.log.error("FAILED", "MEMCACHED", "GET", hashedKey, e.message, data?.toString());
                        resolve(null);
                    }
                } else {
                    this.log.error("FAILED", "MEMCACHED", "GET", hashedKey, err.message);
                    resolve(null);
                }
            });
        });
    };

    async set(hashedKey: string, value: unknown, expirationTimeout: number): Promise<void> {
        return new Promise((resolve) => {
            this.memcached.set(hashedKey, JSON.stringify(value), expirationTimeout !== 0
                ? { expires: expirationTimeout }
                : {}, (err) => {
                if (!err) {
                    this.log.debug("SET", hashedKey);
                } else {
                    this.log.error("FAILED", "MEMCACHED", "SET", hashedKey, err.message);
                }
                resolve();
            });
        });
    };
}

