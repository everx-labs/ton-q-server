"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ensureProtocol = ensureProtocol;
exports.resolveOptions = resolveOptions;
exports.createConfig = createConfig;
exports.STATS = exports.BLOCKCHAIN_DB = exports.defaultOptions = exports.QRequestsMode = void 0;

var _os = _interopRequireDefault(require("os"));

var _dbTypes = require("./db-types");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
 * Copyright 2018-2020 TON DEV SOLUTIONS LTD.
 *
 * Licensed under the SOFTWARE EVALUATION License (the "License"); you may not use
 * this file except in compliance with the License.  You may obtain a copy of the
 * License at:
 *
 * http://www.ton.dev/licenses
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific TON DEV software governing permissions and
 * limitations under the License.
 */
const QRequestsMode = {
  kafka: 'kafka',
  rest: 'rest'
};
exports.QRequestsMode = QRequestsMode;

function ensureProtocol(address, defaultProtocol) {
  return /^\w+:\/\//gi.test(address) ? address : `${defaultProtocol}://${address}`;
}

function getIp() {
  const ipv4 = Object.values(_os.default.networkInterfaces()).reduce((acc, x) => acc.concat(x), []).find(x => x.family === 'IPv4' && !x.internal);
  return ipv4 && ipv4.address;
}

function parseTags(s) {
  const tags = {};
  s.split(',').forEach(t => {
    const i = t.indexOf('=');

    if (i >= 0) {
      tags[t.substr(0, i)] = t.substr(i + 1);
    } else {
      tags[t] = '';
    }
  });
  return tags;
}

const defaultOptions = {
  host: getIp(),
  port: '4000',
  rpcPort: '',
  requestsMode: 'kafka',
  requestsServer: 'kafka:9092',
  requestsTopic: 'requests',
  dbServer: 'arangodb:8529',
  dbName: 'blockchain',
  dbAuth: '',
  dbMaxSockets: '100',
  slowDbServer: '',
  slowDbName: '',
  slowDbAuth: '',
  slowDbMaxSockets: '3',
  authEndpoint: '',
  mamAccessKeys: '',
  jaegerEndpoint: '',
  traceService: 'Q Server',
  traceTags: '',
  statsdServer: '',
  statsdTags: '',
  keepAlive: '60000'
};
exports.defaultOptions = defaultOptions;

function resolveOptions(options, env, defaults) {
  return {
    host: options.host || env.Q_SERVER_HOST || defaults.host,
    port: options.port || env.Q_SERVER_PORT || defaults.port,
    rpcPort: options.rpcPort || env.Q_SERVER_RPC_PORT || defaults.rpcPort,
    requestsMode: options.requestsMode || env.Q_REQUESTS_MODE || defaults.requestsMode,
    requestsServer: options.requestsServer || env.Q_REQUESTS_SERVER || defaults.requestsServer,
    requestsTopic: options.requestsTopic || env.Q_REQUESTS_TOPIC || defaults.requestsTopic,
    dbServer: options.dbServer || env.Q_DATABASE_SERVER || defaults.dbServer,
    dbName: options.dbName || env.Q_DATABASE_NAME || defaults.dbName,
    dbAuth: options.dbAuth || env.Q_DATABASE_AUTH || defaults.dbAuth,
    dbMaxSockets: options.dbMaxSockets || env.Q_DATABASE_MAX_SOCKETS || defaults.dbMaxSockets,
    slowDbServer: options.slowDbServer || env.Q_SLOW_DATABASE_SERVER || defaults.slowDbServer,
    slowDbName: options.slowDbName || env.Q_SLOW_DATABASE_NAME || defaults.slowDbName,
    slowDbAuth: options.slowDbAuth || env.Q_SLOW_DATABASE_AUTH || defaults.slowDbAuth,
    slowDbMaxSockets: options.slowDbMaxSockets || env.Q_SLOW_DATABASE_MAX_SOCKETS || defaults.slowDbMaxSockets,
    authEndpoint: options.authEndpoint || env.Q_AUTH_ENDPOINT || defaults.authEndpoint,
    mamAccessKeys: options.mamAccessKeys || env.Q_MAM_ACCESS_KEYS || defaults.mamAccessKeys,
    jaegerEndpoint: options.jaegerEndpoint || env.Q_JAEGER_ENDPOINT || defaults.jaegerEndpoint,
    traceService: options.traceService || env.Q_TRACE_SERVICE || defaults.traceService,
    traceTags: options.traceTags || env.Q_TRACE_TAGS || defaults.traceTags,
    statsdServer: options.statsdServer || env.Q_STATSD_SERVER || defaults.statsdServer,
    statsdTags: options.statsdTags || env.Q_STATSD_TAGS || defaults.statsdTags,
    keepAlive: options.keepAlive || env.Q_KEEP_ALIVE || defaults.keepAlive
  };
}

function createConfig(options, env, defaults) {
  const resolvedOptions = resolveOptions(options, env, defaults);
  return {
    server: {
      host: resolvedOptions.host,
      port: Number.parseInt(resolvedOptions.port),
      rpcPort: resolvedOptions.rpcPort,
      keepAlive: Number.parseInt(resolvedOptions.keepAlive)
    },
    requests: {
      mode: resolvedOptions.requestsMode,
      server: resolvedOptions.requestsServer,
      topic: resolvedOptions.requestsTopic
    },
    database: {
      server: resolvedOptions.dbServer,
      name: resolvedOptions.dbName,
      auth: resolvedOptions.dbAuth,
      maxSockets: Number(resolvedOptions.dbMaxSockets)
    },
    slowDatabase: {
      server: resolvedOptions.slowDbServer || resolvedOptions.dbServer,
      name: resolvedOptions.slowDbName || resolvedOptions.dbName,
      auth: resolvedOptions.slowDbAuth || resolvedOptions.dbAuth,
      maxSockets: Number(resolvedOptions.slowDbMaxSockets)
    },
    listener: {
      restartTimeout: 1000
    },
    authorization: {
      endpoint: resolvedOptions.authEndpoint
    },
    jaeger: {
      endpoint: resolvedOptions.jaegerEndpoint,
      service: resolvedOptions.traceService,
      tags: parseTags(resolvedOptions.traceTags)
    },
    statsd: {
      server: resolvedOptions.statsdServer,
      tags: (resolvedOptions.statsdTags || '').split(',').map(x => x.trim()).filter(x => x)
    },
    mamAccessKeys: new Set((resolvedOptions.mamAccessKeys || '').split(','))
  };
}

function sortedIndex(fields) {
  return {
    type: 'persistent',
    fields
  };
}

const BLOCKCHAIN = {
  name: 'blockchain',
  collections: {
    blocks: {
      indexes: [sortedIndex(['seq_no', 'gen_utime']), sortedIndex(['gen_utime']), sortedIndex(['workchain_id', 'shard', 'seq_no']), sortedIndex(['workchain_id', 'shard', 'gen_utime']), sortedIndex(['workchain_id', 'seq_no']), sortedIndex(['workchain_id', 'gen_utime']), sortedIndex(['master.min_shard_gen_utime']), sortedIndex(['prev_ref.root_hash', '_key']), sortedIndex(['prev_alt_ref.root_hash', '_key'])]
    },
    accounts: {
      indexes: [sortedIndex(['last_trans_lt']), sortedIndex(['balance'])]
    },
    messages: {
      indexes: [sortedIndex(['block_id']), sortedIndex(['value', 'created_at']), sortedIndex(['src', 'value', 'created_at']), sortedIndex(['dst', 'value', 'created_at']), sortedIndex(['src', 'created_at']), sortedIndex(['dst', 'created_at']), sortedIndex(['created_lt']), sortedIndex(['created_at'])]
    },
    transactions: {
      indexes: [sortedIndex(['block_id']), sortedIndex(['in_msg']), sortedIndex(['out_msgs[*]']), sortedIndex(['account_addr', 'now']), sortedIndex(['now']), sortedIndex(['lt']), sortedIndex(['account_addr', 'orig_status', 'end_status']), sortedIndex(['now', 'account_addr', 'lt'])]
    },
    blocks_signatures: {
      indexes: [sortedIndex(['signatures[*].node_id', 'gen_utime'])]
    }
  }
};
const BLOCKCHAIN_DB = { ...BLOCKCHAIN,
  lastUpdateTime: 0
};
exports.BLOCKCHAIN_DB = BLOCKCHAIN_DB;
Object.entries(BLOCKCHAIN.collections).forEach(([name, collectionMixed]) => {
  const collection = collectionMixed;
  collection.name = name;
  collection.indexes.push({
    fields: ['_key']
  });
});
const STATS = {
  start: 'start',
  prefix: 'qserver.',
  doc: {
    count: 'doc.count'
  },
  post: {
    count: 'post.count',
    failed: 'post.failed'
  },
  query: {
    count: 'query.count',
    time: 'query.time',
    active: 'query.active',
    failed: 'query.failed',
    slow: 'query.slow'
  },
  subscription: {
    active: 'subscription.active'
  },
  waitFor: {
    active: 'waitfor.active'
  }
};
exports.STATS = STATS;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9jb25maWcuanMiXSwibmFtZXMiOlsiUVJlcXVlc3RzTW9kZSIsImthZmthIiwicmVzdCIsImVuc3VyZVByb3RvY29sIiwiYWRkcmVzcyIsImRlZmF1bHRQcm90b2NvbCIsInRlc3QiLCJnZXRJcCIsImlwdjQiLCJPYmplY3QiLCJ2YWx1ZXMiLCJvcyIsIm5ldHdvcmtJbnRlcmZhY2VzIiwicmVkdWNlIiwiYWNjIiwieCIsImNvbmNhdCIsImZpbmQiLCJmYW1pbHkiLCJpbnRlcm5hbCIsInBhcnNlVGFncyIsInMiLCJ0YWdzIiwic3BsaXQiLCJmb3JFYWNoIiwidCIsImkiLCJpbmRleE9mIiwic3Vic3RyIiwiZGVmYXVsdE9wdGlvbnMiLCJob3N0IiwicG9ydCIsInJwY1BvcnQiLCJyZXF1ZXN0c01vZGUiLCJyZXF1ZXN0c1NlcnZlciIsInJlcXVlc3RzVG9waWMiLCJkYlNlcnZlciIsImRiTmFtZSIsImRiQXV0aCIsImRiTWF4U29ja2V0cyIsInNsb3dEYlNlcnZlciIsInNsb3dEYk5hbWUiLCJzbG93RGJBdXRoIiwic2xvd0RiTWF4U29ja2V0cyIsImF1dGhFbmRwb2ludCIsIm1hbUFjY2Vzc0tleXMiLCJqYWVnZXJFbmRwb2ludCIsInRyYWNlU2VydmljZSIsInRyYWNlVGFncyIsInN0YXRzZFNlcnZlciIsInN0YXRzZFRhZ3MiLCJrZWVwQWxpdmUiLCJyZXNvbHZlT3B0aW9ucyIsIm9wdGlvbnMiLCJlbnYiLCJkZWZhdWx0cyIsIlFfU0VSVkVSX0hPU1QiLCJRX1NFUlZFUl9QT1JUIiwiUV9TRVJWRVJfUlBDX1BPUlQiLCJRX1JFUVVFU1RTX01PREUiLCJRX1JFUVVFU1RTX1NFUlZFUiIsIlFfUkVRVUVTVFNfVE9QSUMiLCJRX0RBVEFCQVNFX1NFUlZFUiIsIlFfREFUQUJBU0VfTkFNRSIsIlFfREFUQUJBU0VfQVVUSCIsIlFfREFUQUJBU0VfTUFYX1NPQ0tFVFMiLCJRX1NMT1dfREFUQUJBU0VfU0VSVkVSIiwiUV9TTE9XX0RBVEFCQVNFX05BTUUiLCJRX1NMT1dfREFUQUJBU0VfQVVUSCIsIlFfU0xPV19EQVRBQkFTRV9NQVhfU09DS0VUUyIsIlFfQVVUSF9FTkRQT0lOVCIsIlFfTUFNX0FDQ0VTU19LRVlTIiwiUV9KQUVHRVJfRU5EUE9JTlQiLCJRX1RSQUNFX1NFUlZJQ0UiLCJRX1RSQUNFX1RBR1MiLCJRX1NUQVRTRF9TRVJWRVIiLCJRX1NUQVRTRF9UQUdTIiwiUV9LRUVQX0FMSVZFIiwiY3JlYXRlQ29uZmlnIiwicmVzb2x2ZWRPcHRpb25zIiwic2VydmVyIiwiTnVtYmVyIiwicGFyc2VJbnQiLCJyZXF1ZXN0cyIsIm1vZGUiLCJ0b3BpYyIsImRhdGFiYXNlIiwibmFtZSIsImF1dGgiLCJtYXhTb2NrZXRzIiwic2xvd0RhdGFiYXNlIiwibGlzdGVuZXIiLCJyZXN0YXJ0VGltZW91dCIsImF1dGhvcml6YXRpb24iLCJlbmRwb2ludCIsImphZWdlciIsInNlcnZpY2UiLCJzdGF0c2QiLCJtYXAiLCJ0cmltIiwiZmlsdGVyIiwiU2V0Iiwic29ydGVkSW5kZXgiLCJmaWVsZHMiLCJ0eXBlIiwiQkxPQ0tDSEFJTiIsImNvbGxlY3Rpb25zIiwiYmxvY2tzIiwiaW5kZXhlcyIsImFjY291bnRzIiwibWVzc2FnZXMiLCJ0cmFuc2FjdGlvbnMiLCJibG9ja3Nfc2lnbmF0dXJlcyIsIkJMT0NLQ0hBSU5fREIiLCJsYXN0VXBkYXRlVGltZSIsImVudHJpZXMiLCJjb2xsZWN0aW9uTWl4ZWQiLCJjb2xsZWN0aW9uIiwicHVzaCIsIlNUQVRTIiwic3RhcnQiLCJwcmVmaXgiLCJkb2MiLCJjb3VudCIsInBvc3QiLCJmYWlsZWQiLCJxdWVyeSIsInRpbWUiLCJhY3RpdmUiLCJzbG93Iiwic3Vic2NyaXB0aW9uIiwid2FpdEZvciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQWtCQTs7QUFDQTs7OztBQW5CQTs7Ozs7Ozs7Ozs7Ozs7O0FBcUJPLE1BQU1BLGFBQWEsR0FBRztBQUN6QkMsRUFBQUEsS0FBSyxFQUFFLE9BRGtCO0FBRXpCQyxF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QUFFO0FBRmlCLENBQTlCOztBQUtQekcsTUFBTSxDQUFDMEcsT0FBUCxDQUFlVixVQUFVLENBQUNDLFdBQTFCLEVBQXVDbEYsT0FBdkMsQ0FBK0MsQ0FBQyxDQUFDK0QsSUFBRCxFQUFPNkIsZUFBUCxDQUFELEtBQTZCO0FBQ3hFLFFBQU1DLFVBQVUsR0FBS0QsZUFBckI7QUFDQUMsRUFBQUEsVUFBVSxDQUFDOUIsSUFBWCxHQUFrQkEsSUFBbEI7QUFDQThCLEVBQUFBLFVBQVUsQ0FBQ1QsT0FBWCxDQUFtQlUsSUFBbkIsQ0FBd0I7QUFBRWYsSUFBQUEsTUFBTSxFQUFFLENBQUMsTUFBRDtBQUFWLEdBQXhCO0FBQ0gsQ0FKRDtBQU1PLE1BQU1nQixLQUFLLEdBQUc7QUFDakJDLEVBQUFBLEtBQUssRUFBRSxPQURVO0FBRWpCQyxFQUFBQSxNQUFNLEVBQUUsVUFGUztBQUdqQkMsRUFBQUEsR0FBRyxFQUFFO0FBQ0RDLElBQUFBLEtBQUssRUFBRTtBQUROLEdBSFk7QUFNakJDLEVBQUFBLElBQUksRUFBRTtBQUNGRCxJQUFBQSxLQUFLLEVBQUUsWUFETDtBQUVGRSxJQUFBQSxNQUFNLEVBQUU7QUFGTixHQU5XO0FBVWpCQyxFQUFBQSxLQUFLLEVBQUU7QUFDSEgsSUFBQUEsS0FBSyxFQUFFLGFBREo7QUFFSEksSUFBQUEsSUFBSSxFQUFFLFlBRkg7QUFHSEMsSUFBQUEsTUFBTSxFQUFFLGNBSEw7QUFJSEgsSUFBQUEsTUFBTSxFQUFFLGNBSkw7QUFLSEksSUFBQUEsSUFBSSxFQUFFO0FBTEgsR0FWVTtBQWlCakJDLEVBQUFBLFlBQVksRUFBRTtBQUNWRixJQUFBQSxNQUFNLEVBQUU7QUFERSxHQWpCRztBQW9CakJHLEVBQUFBLE9BQU8sRUFBRTtBQUNMSCxJQUFBQSxNQUFNLEVBQUU7QUFESDtBQXBCUSxDQUFkIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAyMDE4LTIwMjAgVE9OIERFViBTT0xVVElPTlMgTFRELlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBTT0ZUV0FSRSBFVkFMVUFUSU9OIExpY2Vuc2UgKHRoZSBcIkxpY2Vuc2VcIik7IHlvdSBtYXkgbm90IHVzZVxuICogdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlXG4gKiBMaWNlbnNlIGF0OlxuICpcbiAqIGh0dHA6Ly93d3cudG9uLmRldi9saWNlbnNlc1xuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgVE9OIERFViBzb2Z0d2FyZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG4vLyBAZmxvd1xuXG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgcGFyc2VJbmRleCB9IGZyb20gJy4vZGItdHlwZXMnO1xuXG5leHBvcnQgY29uc3QgUVJlcXVlc3RzTW9kZSA9IHtcbiAgICBrYWZrYTogJ2thZmthJyxcbiAgICByZXN0OiAncmVzdCcsXG59O1xuXG5leHBvcnQgdHlwZSBRRGJDb25maWcgPSB7XG4gICAgc2VydmVyOiBzdHJpbmcsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGF1dGg6IHN0cmluZyxcbiAgICBtYXhTb2NrZXRzOiBudW1iZXIsXG59O1xuXG5leHBvcnQgdHlwZSBRQ29uZmlnID0ge1xuICAgIHNlcnZlcjoge1xuICAgICAgICBob3N0OiBzdHJpbmcsXG4gICAgICAgIHBvcnQ6IG51bWJlcixcbiAgICAgICAgcnBjUG9ydDogc3RyaW5nLFxuICAgICAgICBrZWVwQWxpdmU6IG51bWJlcixcbiAgICB9LFxuICAgIHJlcXVlc3RzOiB7XG4gICAgICAgIG1vZGU6ICdrYWZrYScgfCAncmVzdCcsXG4gICAgICAgIHNlcnZlcjogc3RyaW5nLFxuICAgICAgICB0b3BpYzogc3RyaW5nLFxuICAgIH0sXG4gICAgZGF0YWJhc2U6IFFEYkNvbmZpZyxcbiAgICBzbG93RGF0YWJhc2U6IFFEYkNvbmZpZyxcbiAgICBsaXN0ZW5lcjoge1xuICAgICAgICByZXN0YXJ0VGltZW91dDogbnVtYmVyXG4gICAgfSxcbiAgICBhdXRob3JpemF0aW9uOiB7XG4gICAgICAgIGVuZHBvaW50OiBzdHJpbmcsXG4gICAgfSxcbiAgICBqYWVnZXI6IHtcbiAgICAgICAgZW5kcG9pbnQ6IHN0cmluZyxcbiAgICAgICAgc2VydmljZTogc3RyaW5nLFxuICAgICAgICB0YWdzOiB7IFtzdHJpbmddOiBzdHJpbmcgfVxuICAgIH0sXG4gICAgc3RhdHNkOiB7XG4gICAgICAgIHNlcnZlcjogc3RyaW5nLFxuICAgICAgICB0YWdzOiBzdHJpbmdbXSxcbiAgICB9LFxuICAgIG1hbUFjY2Vzc0tleXM6IFNldDxzdHJpbmc+LFxuICAgIGlzVGVzdHM/OiBib29sZWFuLFxufVxuXG5leHBvcnQgdHlwZSBQcm9ncmFtT3B0aW9ucyA9IHtcbiAgICByZXF1ZXN0c01vZGU6ICdrYWZrYScgfCAncmVzdCcsXG4gICAgcmVxdWVzdHNTZXJ2ZXI6IHN0cmluZyxcbiAgICByZXF1ZXN0c1RvcGljOiBzdHJpbmcsXG4gICAgZGJTZXJ2ZXI6IHN0cmluZyxcbiAgICBkYk5hbWU6IHN0cmluZyxcbiAgICBkYkF1dGg6IHN0cmluZyxcbiAgICBkYk1heFNvY2tldHM6IHN0cmluZyxcbiAgICBzbG93RGJTZXJ2ZXI6IHN0cmluZyxcbiAgICBzbG93RGJOYW1lOiBzdHJpbmcsXG4gICAgc2xvd0RiQXV0aDogc3RyaW5nLFxuICAgIHNsb3dEYk1heFNvY2tldHM6IHN0cmluZyxcbiAgICBob3N0OiBzdHJpbmcsXG4gICAgcG9ydDogc3RyaW5nLFxuICAgIHJwY1BvcnQ6IHN0cmluZyxcbiAgICBqYWVnZXJFbmRwb2ludDogc3RyaW5nLFxuICAgIHRyYWNlU2VydmljZTogc3RyaW5nLFxuICAgIHRyYWNlVGFnczogc3RyaW5nLFxuICAgIGF1dGhFbmRwb2ludDogc3RyaW5nLFxuICAgIHN0YXRzZFNlcnZlcjogc3RyaW5nLFxuICAgIHN0YXRzZFRhZ3M6IHN0cmluZyxcbiAgICBtYW1BY2Nlc3NLZXlzOiBzdHJpbmcsXG4gICAga2VlcEFsaXZlOiBzdHJpbmcsXG59XG5cbnR5cGUgUHJvZ3JhbUVudiA9IHtcbiAgICBRX1NFUlZFUl9IT1NUOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfU0VSVkVSX1BPUlQ6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9TRVJWRVJfUlBDX1BPUlQ6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9SRVFVRVNUU19NT0RFOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfUkVRVUVTVFNfU0VSVkVSOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfUkVRVUVTVFNfVE9QSUM6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9EQVRBQkFTRV9TRVJWRVI6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9EQVRBQkFTRV9OQU1FOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfREFUQUJBU0VfQVVUSDogc3RyaW5nIHwgdm9pZCxcbiAgICBRX0RBVEFCQVNFX01BWF9TT0NLRVRTOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfU0xPV19EQVRBQkFTRV9TRVJWRVI6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9TTE9XX0RBVEFCQVNFX05BTUU6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9TTE9XX0RBVEFCQVNFX0FVVEg6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9TTE9XX0RBVEFCQVNFX01BWF9TT0NLRVRTOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfQVVUSF9FTkRQT0lOVDogc3RyaW5nIHwgdm9pZCxcbiAgICBRX01BTV9BQ0NFU1NfS0VZUzogc3RyaW5nIHwgdm9pZCxcbiAgICBRX0pBRUdFUl9FTkRQT0lOVDogc3RyaW5nIHwgdm9pZCxcbiAgICBRX1RSQUNFX1NFUlZJQ0U6IHN0cmluZyB8IHZvaWQsXG4gICAgUV9UUkFDRV9UQUdTOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfU1RBVFNEX1NFUlZFUjogc3RyaW5nIHwgdm9pZCxcbiAgICBRX1NUQVRTRF9UQUdTOiBzdHJpbmcgfCB2b2lkLFxuICAgIFFfS0VFUF9BTElWRTogc3RyaW5nIHwgdm9pZCxcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVByb3RvY29sKGFkZHJlc3M6IHN0cmluZywgZGVmYXVsdFByb3RvY29sOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiAvXlxcdys6XFwvXFwvL2dpLnRlc3QoYWRkcmVzcykgPyBhZGRyZXNzIDogYCR7ZGVmYXVsdFByb3RvY29sfTovLyR7YWRkcmVzc31gO1xufVxuXG5mdW5jdGlvbiBnZXRJcCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IGlwdjQgPSAoT2JqZWN0LnZhbHVlcyhvcy5uZXR3b3JrSW50ZXJmYWNlcygpKTogYW55KVxuICAgICAgICAucmVkdWNlKChhY2MsIHgpID0+IGFjYy5jb25jYXQoeCksIFtdKVxuICAgICAgICAuZmluZCh4ID0+IHguZmFtaWx5ID09PSAnSVB2NCcgJiYgIXguaW50ZXJuYWwpO1xuICAgIHJldHVybiBpcHY0ICYmIGlwdjQuYWRkcmVzcztcbn1cblxuZnVuY3Rpb24gcGFyc2VUYWdzKHM6IHN0cmluZyk6IHsgW3N0cmluZ106IHN0cmluZyB9IHtcbiAgICBjb25zdCB0YWdzOiB7IFtzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuICAgIHMuc3BsaXQoJywnKS5mb3JFYWNoKCh0KSA9PiB7XG4gICAgICAgIGNvbnN0IGkgPSB0LmluZGV4T2YoJz0nKTtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgdGFnc1t0LnN1YnN0cigwLCBpKV0gPSB0LnN1YnN0cihpICsgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0YWdzW3RdID0gJyc7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gdGFncztcblxufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdE9wdGlvbnM6IFByb2dyYW1PcHRpb25zID0ge1xuICAgIGhvc3Q6IGdldElwKCksXG4gICAgcG9ydDogJzQwMDAnLFxuICAgIHJwY1BvcnQ6ICcnLFxuICAgIHJlcXVlc3RzTW9kZTogJ2thZmthJyxcbiAgICByZXF1ZXN0c1NlcnZlcjogJ2thZmthOjkwOTInLFxuICAgIHJlcXVlc3RzVG9waWM6ICdyZXF1ZXN0cycsXG4gICAgZGJTZXJ2ZXI6ICdhcmFuZ29kYjo4NTI5JyxcbiAgICBkYk5hbWU6ICdibG9ja2NoYWluJyxcbiAgICBkYkF1dGg6ICcnLFxuICAgIGRiTWF4U29ja2V0czogJzEwMCcsXG4gICAgc2xvd0RiU2VydmVyOiAnJyxcbiAgICBzbG93RGJOYW1lOiAnJyxcbiAgICBzbG93RGJBdXRoOiAnJyxcbiAgICBzbG93RGJNYXhTb2NrZXRzOiAnMycsXG4gICAgYXV0aEVuZHBvaW50OiAnJyxcbiAgICBtYW1BY2Nlc3NLZXlzOiAnJyxcbiAgICBqYWVnZXJFbmRwb2ludDogJycsXG4gICAgdHJhY2VTZXJ2aWNlOiAnUSBTZXJ2ZXInLFxuICAgIHRyYWNlVGFnczogJycsXG4gICAgc3RhdHNkU2VydmVyOiAnJyxcbiAgICBzdGF0c2RUYWdzOiAnJyxcbiAgICBrZWVwQWxpdmU6ICc2MDAwMCcsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZU9wdGlvbnMob3B0aW9uczogJFNoYXBlPFByb2dyYW1PcHRpb25zPiwgZW52OiBQcm9ncmFtRW52LCBkZWZhdWx0czogUHJvZ3JhbU9wdGlvbnMpOiBQcm9ncmFtT3B0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgaG9zdDogb3B0aW9ucy5ob3N0IHx8IGVudi5RX1NFUlZFUl9IT1NUIHx8IGRlZmF1bHRzLmhvc3QsXG4gICAgICAgIHBvcnQ6IG9wdGlvbnMucG9ydCB8fCBlbnYuUV9TRVJWRVJfUE9SVCB8fCBkZWZhdWx0cy5wb3J0LFxuICAgICAgICBycGNQb3J0OiBvcHRpb25zLnJwY1BvcnQgfHwgZW52LlFfU0VSVkVSX1JQQ19QT1JUIHx8IGRlZmF1bHRzLnJwY1BvcnQsXG4gICAgICAgIHJlcXVlc3RzTW9kZTogb3B0aW9ucy5yZXF1ZXN0c01vZGUgfHwgKGVudi5RX1JFUVVFU1RTX01PREU6IGFueSkgfHwgZGVmYXVsdHMucmVxdWVzdHNNb2RlLFxuICAgICAgICByZXF1ZXN0c1NlcnZlcjogb3B0aW9ucy5yZXF1ZXN0c1NlcnZlciB8fCBlbnYuUV9SRVFVRVNUU19TRVJWRVIgfHwgZGVmYXVsdHMucmVxdWVzdHNTZXJ2ZXIsXG4gICAgICAgIHJlcXVlc3RzVG9waWM6IG9wdGlvbnMucmVxdWVzdHNUb3BpYyB8fCBlbnYuUV9SRVFVRVNUU19UT1BJQyB8fCBkZWZhdWx0cy5yZXF1ZXN0c1RvcGljLFxuICAgICAgICBkYlNlcnZlcjogb3B0aW9ucy5kYlNlcnZlciB8fCBlbnYuUV9EQVRBQkFTRV9TRVJWRVIgfHwgZGVmYXVsdHMuZGJTZXJ2ZXIsXG4gICAgICAgIGRiTmFtZTogb3B0aW9ucy5kYk5hbWUgfHwgZW52LlFfREFUQUJBU0VfTkFNRSB8fCBkZWZhdWx0cy5kYk5hbWUsXG4gICAgICAgIGRiQXV0aDogb3B0aW9ucy5kYkF1dGggfHwgZW52LlFfREFUQUJBU0VfQVVUSCB8fCBkZWZhdWx0cy5kYkF1dGgsXG4gICAgICAgIGRiTWF4U29ja2V0czogb3B0aW9ucy5kYk1heFNvY2tldHMgfHwgZW52LlFfREFUQUJBU0VfTUFYX1NPQ0tFVFMgfHwgZGVmYXVsdHMuZGJNYXhTb2NrZXRzLFxuICAgICAgICBzbG93RGJTZXJ2ZXI6IG9wdGlvbnMuc2xvd0RiU2VydmVyIHx8IGVudi5RX1NMT1dfREFUQUJBU0VfU0VSVkVSIHx8IGRlZmF1bHRzLnNsb3dEYlNlcnZlcixcbiAgICAgICAgc2xvd0RiTmFtZTogb3B0aW9ucy5zbG93RGJOYW1lIHx8IGVudi5RX1NMT1dfREFUQUJBU0VfTkFNRSB8fCBkZWZhdWx0cy5zbG93RGJOYW1lLFxuICAgICAgICBzbG93RGJBdXRoOiBvcHRpb25zLnNsb3dEYkF1dGggfHwgZW52LlFfU0xPV19EQVRBQkFTRV9BVVRIIHx8IGRlZmF1bHRzLnNsb3dEYkF1dGgsXG4gICAgICAgIHNsb3dEYk1heFNvY2tldHM6IG9wdGlvbnMuc2xvd0RiTWF4U29ja2V0cyB8fCBlbnYuUV9TTE9XX0RBVEFCQVNFX01BWF9TT0NLRVRTIHx8IGRlZmF1bHRzLnNsb3dEYk1heFNvY2tldHMsXG4gICAgICAgIGF1dGhFbmRwb2ludDogb3B0aW9ucy5hdXRoRW5kcG9pbnQgfHwgZW52LlFfQVVUSF9FTkRQT0lOVCB8fCBkZWZhdWx0cy5hdXRoRW5kcG9pbnQsXG4gICAgICAgIG1hbUFjY2Vzc0tleXM6IG9wdGlvbnMubWFtQWNjZXNzS2V5cyB8fCBlbnYuUV9NQU1fQUNDRVNTX0tFWVMgfHwgZGVmYXVsdHMubWFtQWNjZXNzS2V5cyxcbiAgICAgICAgamFlZ2VyRW5kcG9pbnQ6IG9wdGlvbnMuamFlZ2VyRW5kcG9pbnQgfHwgZW52LlFfSkFFR0VSX0VORFBPSU5UIHx8IGRlZmF1bHRzLmphZWdlckVuZHBvaW50LFxuICAgICAgICB0cmFjZVNlcnZpY2U6IG9wdGlvbnMudHJhY2VTZXJ2aWNlIHx8IGVudi5RX1RSQUNFX1NFUlZJQ0UgfHwgZGVmYXVsdHMudHJhY2VTZXJ2aWNlLFxuICAgICAgICB0cmFjZVRhZ3M6IG9wdGlvbnMudHJhY2VUYWdzIHx8IGVudi5RX1RSQUNFX1RBR1MgfHwgZGVmYXVsdHMudHJhY2VUYWdzLFxuICAgICAgICBzdGF0c2RTZXJ2ZXI6IG9wdGlvbnMuc3RhdHNkU2VydmVyIHx8IGVudi5RX1NUQVRTRF9TRVJWRVIgfHwgZGVmYXVsdHMuc3RhdHNkU2VydmVyLFxuICAgICAgICBzdGF0c2RUYWdzOiBvcHRpb25zLnN0YXRzZFRhZ3MgfHwgZW52LlFfU1RBVFNEX1RBR1MgfHwgZGVmYXVsdHMuc3RhdHNkVGFncyxcbiAgICAgICAga2VlcEFsaXZlOiBvcHRpb25zLmtlZXBBbGl2ZSB8fCBlbnYuUV9LRUVQX0FMSVZFIHx8IGRlZmF1bHRzLmtlZXBBbGl2ZSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29uZmlnKG9wdGlvbnM6ICRTaGFwZTxQcm9ncmFtT3B0aW9ucz4sIGVudjogUHJvZ3JhbUVudiwgZGVmYXVsdHM6IFByb2dyYW1PcHRpb25zKTogUUNvbmZpZyB7XG4gICAgY29uc3QgcmVzb2x2ZWRPcHRpb25zID0gcmVzb2x2ZU9wdGlvbnMob3B0aW9ucywgZW52LCBkZWZhdWx0cyk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2VydmVyOiB7XG4gICAgICAgICAgICBob3N0OiByZXNvbHZlZE9wdGlvbnMuaG9zdCxcbiAgICAgICAgICAgIHBvcnQ6IE51bWJlci5wYXJzZUludChyZXNvbHZlZE9wdGlvbnMucG9ydCksXG4gICAgICAgICAgICBycGNQb3J0OiByZXNvbHZlZE9wdGlvbnMucnBjUG9ydCxcbiAgICAgICAgICAgIGtlZXBBbGl2ZTogTnVtYmVyLnBhcnNlSW50KHJlc29sdmVkT3B0aW9ucy5rZWVwQWxpdmUpLFxuICAgICAgICB9LFxuICAgICAgICByZXF1ZXN0czoge1xuICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRPcHRpb25zLnJlcXVlc3RzTW9kZSxcbiAgICAgICAgICAgIHNlcnZlcjogcmVzb2x2ZWRPcHRpb25zLnJlcXVlc3RzU2VydmVyLFxuICAgICAgICAgICAgdG9waWM6IHJlc29sdmVkT3B0aW9ucy5yZXF1ZXN0c1RvcGljLFxuICAgICAgICB9LFxuICAgICAgICBkYXRhYmFzZToge1xuICAgICAgICAgICAgc2VydmVyOiByZXNvbHZlZE9wdGlvbnMuZGJTZXJ2ZXIsXG4gICAgICAgICAgICBuYW1lOiByZXNvbHZlZE9wdGlvbnMuZGJOYW1lLFxuICAgICAgICAgICAgYXV0aDogcmVzb2x2ZWRPcHRpb25zLmRiQXV0aCxcbiAgICAgICAgICAgIG1heFNvY2tldHM6IE51bWJlcihyZXNvbHZlZE9wdGlvbnMuZGJNYXhTb2NrZXRzKSxcbiAgICAgICAgfSxcbiAgICAgICAgc2xvd0RhdGFiYXNlOiB7XG4gICAgICAgICAgICBzZXJ2ZXI6IHJlc29sdmVkT3B0aW9ucy5zbG93RGJTZXJ2ZXIgfHwgcmVzb2x2ZWRPcHRpb25zLmRiU2VydmVyLFxuICAgICAgICAgICAgbmFtZTogcmVzb2x2ZWRPcHRpb25zLnNsb3dEYk5hbWUgfHwgcmVzb2x2ZWRPcHRpb25zLmRiTmFtZSxcbiAgICAgICAgICAgIGF1dGg6IHJlc29sdmVkT3B0aW9ucy5zbG93RGJBdXRoIHx8IHJlc29sdmVkT3B0aW9ucy5kYkF1dGgsXG4gICAgICAgICAgICBtYXhTb2NrZXRzOiBOdW1iZXIocmVzb2x2ZWRPcHRpb25zLnNsb3dEYk1heFNvY2tldHMpLFxuICAgICAgICB9LFxuICAgICAgICBsaXN0ZW5lcjoge1xuICAgICAgICAgICAgcmVzdGFydFRpbWVvdXQ6IDEwMDAsXG4gICAgICAgIH0sXG4gICAgICAgIGF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZE9wdGlvbnMuYXV0aEVuZHBvaW50LFxuICAgICAgICB9LFxuICAgICAgICBqYWVnZXI6IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZE9wdGlvbnMuamFlZ2VyRW5kcG9pbnQsXG4gICAgICAgICAgICBzZXJ2aWNlOiByZXNvbHZlZE9wdGlvbnMudHJhY2VTZXJ2aWNlLFxuICAgICAgICAgICAgdGFnczogcGFyc2VUYWdzKHJlc29sdmVkT3B0aW9ucy50cmFjZVRhZ3MpLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0c2Q6IHtcbiAgICAgICAgICAgIHNlcnZlcjogcmVzb2x2ZWRPcHRpb25zLnN0YXRzZFNlcnZlcixcbiAgICAgICAgICAgIHRhZ3M6IChyZXNvbHZlZE9wdGlvbnMuc3RhdHNkVGFncyB8fCAnJykuc3BsaXQoJywnKS5tYXAoeCA9PiB4LnRyaW0oKSkuZmlsdGVyKHggPT4geCksXG4gICAgICAgIH0sXG4gICAgICAgIG1hbUFjY2Vzc0tleXM6IG5ldyBTZXQoKHJlc29sdmVkT3B0aW9ucy5tYW1BY2Nlc3NLZXlzIHx8ICcnKS5zcGxpdCgnLCcpKSxcbiAgICB9O1xufVxuXG5leHBvcnQgdHlwZSBJbmRleEluZm8gPSB7XG4gICAgZmllbGRzOiBzdHJpbmdbXSxcbiAgICB0eXBlPzogc3RyaW5nLFxufVxuXG5leHBvcnQgdHlwZSBDb2xsZWN0aW9uSW5mbyA9IHtcbiAgICBuYW1lPzogc3RyaW5nLFxuICAgIGluZGV4ZXM6IEluZGV4SW5mb1tdLFxufTtcblxuZXhwb3J0IHR5cGUgRGJJbmZvID0ge1xuICAgIG5hbWU6IHN0cmluZyxcbiAgICBjb2xsZWN0aW9uczoge1xuICAgICAgICBbc3RyaW5nXTogQ29sbGVjdGlvbkluZm8sXG4gICAgfVxufVxuXG5mdW5jdGlvbiBzb3J0ZWRJbmRleChmaWVsZHM6IHN0cmluZ1tdKTogSW5kZXhJbmZvIHtcbiAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiAncGVyc2lzdGVudCcsXG4gICAgICAgIGZpZWxkcyxcbiAgICB9O1xufVxuXG5jb25zdCBCTE9DS0NIQUlOOiB7XG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGNvbGxlY3Rpb25zOiB7XG4gICAgICAgIFtzdHJpbmddOiBDb2xsZWN0aW9uSW5mbyxcbiAgICB9XG59ID0ge1xuICAgIG5hbWU6ICdibG9ja2NoYWluJyxcbiAgICBjb2xsZWN0aW9uczoge1xuICAgICAgICBibG9ja3M6IHtcbiAgICAgICAgICAgIGluZGV4ZXM6IFtcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ3NlcV9ubycsICdnZW5fdXRpbWUnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydnZW5fdXRpbWUnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWyd3b3JrY2hhaW5faWQnLCAnc2hhcmQnLCAnc2VxX25vJ10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnd29ya2NoYWluX2lkJywgJ3NoYXJkJywgJ2dlbl91dGltZSddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ3dvcmtjaGFpbl9pZCcsICdzZXFfbm8nXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWyd3b3JrY2hhaW5faWQnLCAnZ2VuX3V0aW1lJ10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnbWFzdGVyLm1pbl9zaGFyZF9nZW5fdXRpbWUnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydwcmV2X3JlZi5yb290X2hhc2gnLCAnX2tleSddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ3ByZXZfYWx0X3JlZi5yb290X2hhc2gnLCAnX2tleSddKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIGFjY291bnRzOiB7XG4gICAgICAgICAgICBpbmRleGVzOiBbXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydsYXN0X3RyYW5zX2x0J10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnYmFsYW5jZSddKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIG1lc3NhZ2VzOiB7XG4gICAgICAgICAgICBpbmRleGVzOiBbXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydibG9ja19pZCddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ3ZhbHVlJywgJ2NyZWF0ZWRfYXQnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydzcmMnLCAndmFsdWUnLCAnY3JlYXRlZF9hdCddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ2RzdCcsICd2YWx1ZScsICdjcmVhdGVkX2F0J10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnc3JjJywgJ2NyZWF0ZWRfYXQnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydkc3QnLCAnY3JlYXRlZF9hdCddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ2NyZWF0ZWRfbHQnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydjcmVhdGVkX2F0J10pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgdHJhbnNhY3Rpb25zOiB7XG4gICAgICAgICAgICBpbmRleGVzOiBbXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydibG9ja19pZCddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ2luX21zZyddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ291dF9tc2dzWypdJ10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnYWNjb3VudF9hZGRyJywgJ25vdyddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ25vdyddKSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ2x0J10pLFxuICAgICAgICAgICAgICAgIHNvcnRlZEluZGV4KFsnYWNjb3VudF9hZGRyJywgJ29yaWdfc3RhdHVzJywgJ2VuZF9zdGF0dXMnXSksXG4gICAgICAgICAgICAgICAgc29ydGVkSW5kZXgoWydub3cnLCAnYWNjb3VudF9hZGRyJywgJ2x0J10pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgYmxvY2tzX3NpZ25hdHVyZXM6IHtcbiAgICAgICAgICAgIGluZGV4ZXM6IFtcbiAgICAgICAgICAgICAgICBzb3J0ZWRJbmRleChbJ3NpZ25hdHVyZXNbKl0ubm9kZV9pZCcsICdnZW5fdXRpbWUnXSksXG4gICAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgIH0sXG59O1xuXG5leHBvcnQgY29uc3QgQkxPQ0tDSEFJTl9EQjogRGJJbmZvID0ge1xuICAgIC4uLkJMT0NLQ0hBSU4sXG4gICAgbGFzdFVwZGF0ZVRpbWU6IDAsXG59O1xuXG5PYmplY3QuZW50cmllcyhCTE9DS0NIQUlOLmNvbGxlY3Rpb25zKS5mb3JFYWNoKChbbmFtZSwgY29sbGVjdGlvbk1peGVkXSkgPT4ge1xuICAgIGNvbnN0IGNvbGxlY3Rpb24gPSAoKGNvbGxlY3Rpb25NaXhlZDogYW55KTogQ29sbGVjdGlvbkluZm8pO1xuICAgIGNvbGxlY3Rpb24ubmFtZSA9IG5hbWU7XG4gICAgY29sbGVjdGlvbi5pbmRleGVzLnB1c2goeyBmaWVsZHM6IFsnX2tleSddIH0pO1xufSk7XG5cbmV4cG9ydCBjb25zdCBTVEFUUyA9IHtcbiAgICBzdGFydDogJ3N0YXJ0JyxcbiAgICBwcmVmaXg6ICdxc2VydmVyLicsXG4gICAgZG9jOiB7XG4gICAgICAgIGNvdW50OiAnZG9jLmNvdW50JyxcbiAgICB9LFxuICAgIHBvc3Q6IHtcbiAgICAgICAgY291bnQ6ICdwb3N0LmNvdW50JyxcbiAgICAgICAgZmFpbGVkOiAncG9zdC5mYWlsZWQnLFxuICAgIH0sXG4gICAgcXVlcnk6IHtcbiAgICAgICAgY291bnQ6ICdxdWVyeS5jb3VudCcsXG4gICAgICAgIHRpbWU6ICdxdWVyeS50aW1lJyxcbiAgICAgICAgYWN0aXZlOiAncXVlcnkuYWN0aXZlJyxcbiAgICAgICAgZmFpbGVkOiAncXVlcnkuZmFpbGVkJyxcbiAgICAgICAgc2xvdzogJ3F1ZXJ5LnNsb3cnLFxuICAgIH0sXG4gICAgc3Vic2NyaXB0aW9uOiB7XG4gICAgICAgIGFjdGl2ZTogJ3N1YnNjcmlwdGlvbi5hY3RpdmUnLFxuICAgIH0sXG4gICAgd2FpdEZvcjoge1xuICAgICAgICBhY3RpdmU6ICd3YWl0Zm9yLmFjdGl2ZScsXG4gICAgfSxcbn07XG5cbiJdfQ==