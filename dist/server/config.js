"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ensureProtocol = ensureProtocol;
exports.parseArangoConfig = parseArangoConfig;
exports.parseMemCachedConfig = parseMemCachedConfig;
exports.overrideDefs = overrideDefs;
exports.resolveValues = resolveValues;
exports.createConfig = createConfig;
exports.parseDataConfig = parseDataConfig;
exports.STATS = exports.programOptions = exports.requestsMode = void 0;

var _os = _interopRequireDefault(require("os"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
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
const DEFAULT_LISTENER_RESTART_TIMEOUT = 1000;
const DEFAULT_ARANGO_MAX_SOCKETS = 100;
const DEFAULT_SLOW_QUERIES_ARANGO_MAX_SOCKETS = 3;
const requestsMode = {
  kafka: 'kafka',
  rest: 'rest'
};
exports.requestsMode = requestsMode;
const programOptions = {};
exports.programOptions = programOptions;

const toPascal = s => `${s[0].toUpperCase()}${s.substr(1).toLowerCase()}`;

const opt = (option, def, description) => {
  const words = option.split('-');
  const name = `${words[0]}${words.slice(1).map(toPascal).join('')}`;
  const env = `Q_${words.map(x => x.toUpperCase()).join('_')}`;
  programOptions[name] = {
    option: `--${option} <value>`,
    env,
    def,
    description
  };
};

const dataOpt = prefix => {
  const o = name => `${prefix.toLowerCase().split(' ').join('-')}-${name}`;

  const d = text => `${toPascal(prefix)} ${text}`;

  opt(o('mut'), 'arangodb', d('mutable db config url'));
  opt(o('hot'), 'arangodb', d('hot db config url'));
  opt(o('cold'), '', d('cold db config urls (comma separated)'));
  opt(o('cache'), '', d('cache config url'));
};

opt('host', getIp(), 'Listening address');
opt('port', '4000', 'Listening port');
opt('keep-alive', '60000', 'GraphQL keep alive ms');
opt('requests-mode', 'kafka', 'Requests mode (kafka | rest)');
opt('requests-server', 'kafka:9092', 'Requests server url');
opt('requests-topic', 'requests', 'Requests topic name');
dataOpt('data');
dataOpt('slow queries');
opt('auth-endpoint', '', 'Auth endpoint');
opt('mam-access-keys', '', 'Access keys used to authorize mam endpoint access');
opt('jaeger-endpoint', '', 'Jaeger endpoint');
opt('trace-service', 'Q Server', 'Trace service name');
opt('trace-tags', '', 'Additional trace tags (comma separated name=value pairs)');
opt('statsd-server', '', 'StatsD server (host:port)');
opt('statsd-tags', '', 'Additional StatsD tags (comma separated name=value pairs)'); // Stats Schema

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

function ensureProtocol(address, defaultProtocol) {
  return /^\w+:\/\//gi.test(address) ? address : `${defaultProtocol}://${address}`;
}

function parseArangoConfig(config, defMaxSockets) {
  const lowerCased = config.toLowerCase().trim();
  const hasProtocol = lowerCased.startsWith('http:') || lowerCased.startsWith('https:');
  const url = new URL(hasProtocol ? config : `https://${config}`);
  const protocol = url.protocol || 'https:';
  const host = url.port || protocol.toLowerCase() === 'https:' ? url.host : `${url.host}:8059`;
  const path = url.pathname !== '/' ? url.pathname : '';

  const param = name => url.searchParams.get(name) || '';

  return {
    server: `${protocol}//${host}${path}`,
    auth: url.username && `${url.username}:${url.password}`,
    name: param('name') || 'blockchain',
    maxSockets: Number.parseInt(param('maxSockets')) || defMaxSockets,
    listenerRestartTimeout: Number.parseInt(param('listenerRestartTimeout')) || DEFAULT_LISTENER_RESTART_TIMEOUT
  };
}

function parseMemCachedConfig(config) {
  return {
    server: config
  };
}

function overrideDefs(options, defs) {
  const resolved = {};
  Object.entries(options).forEach(([name, value]) => {
    const opt = value;
    resolved[name] = { ...opt,
      def: defs[name] || opt.def
    };
  });
  return resolved;
}

function resolveValues(values, env, def) {
  const resolved = {};
  Object.entries(def).forEach(([name, value]) => {
    const opt = value;
    resolved[name] = values[name] || env[opt.env] || def[name].def;
  });
  return resolved;
}

function createConfig(values, env, def) {
  const resolved = resolveValues(values, env, def);
  const {
    data,
    slowQueriesData
  } = parseDataConfig(resolved);
  return {
    server: {
      host: resolved.host,
      port: Number.parseInt(resolved.port),
      keepAlive: Number.parseInt(resolved.keepAlive)
    },
    requests: {
      mode: resolved.requestsMode,
      server: resolved.requestsServer,
      topic: resolved.requestsTopic
    },
    data,
    slowQueriesData,
    authorization: {
      endpoint: resolved.authEndpoint
    },
    mamAccessKeys: new Set((resolved.mamAccessKeys || '').split(',')),
    jaeger: {
      endpoint: resolved.jaegerEndpoint,
      service: resolved.traceService,
      tags: parseTags(resolved.traceTags)
    },
    statsd: {
      server: resolved.statsdServer,
      tags: (resolved.statsdTags || '').split(',').map(x => x.trim()).filter(x => x)
    }
  };
} // Internals


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

function parseDataConfig(values) {
  function parse(prefix, defMaxSockets) {
    const opt = suffix => values[`${prefix}${suffix}`] || '';

    return {
      mut: parseArangoConfig(opt('Mut'), defMaxSockets),
      hot: parseArangoConfig(opt('Hot'), defMaxSockets),
      cold: opt('Cold').split(',').filter(x => x).map(x => parseArangoConfig(x, defMaxSockets)),
      cache: parseMemCachedConfig(opt('Cache'))
    };
  }

  return {
    data: parse('data', DEFAULT_ARANGO_MAX_SOCKETS),
    slowQueriesData: parse('slowQueries', DEFAULT_SLOW_QUERIES_ARANGO_MAX_SOCKETS)
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXJ2ZXIvY29uZmlnLmpzIl0sIm5hbWVzIjpbIkRFRkFVTFRfTElTVEVORVJfUkVTVEFSVF9USU1FT1VUIiwiREVGQVVMVF9BUkFOR09fTUFYX1NPQ0tFVFMiLCJERUZBVUxUX1NMT1dfUVVFUklFU19BUkFOR09fTUFYX1NPQ0tFVFMiLCJyZXF1ZXN0c01vZGUiLCJrYWZrYSIsInJlc3QiLCJwcm9ncmFtT3B0aW9ucyIsInRvUGFzY2FsIiwicyIsInRvVXBwZXJDYXNlIiwic3Vic3RyIiwidG9Mb3dlckNhc2UiLCJvcHQiLCJvcHRpb24iLCJkZWYiLCJkZXNjcmlwdGlvbiIsIndvcmRzIiwic3BsaXQiLCJuYW1lIiwic2xpY2UiLCJtYXAiLCJqb2luIiwiZW52IiwieCIsImRhdGFPcHQiLCJwcmVmaXgiLCJvIiwiZCIsInRleHQiLCJnZXRJcCIsIlNUQVRTIiwic3RhcnQiLCJkb2MiLCJjb3VudCIsInBvc3QiLCJmYWlsZWQiLCJxdWVyeSIsInRpbWUiLCJhY3RpdmUiLCJzbG93Iiwic3Vic2NyaXB0aW9uIiwid2FpdEZvciIsImVuc3VyZVByb3RvY29sIiwiYWRkcmVzcyIsImRlZmF1bHRQcm90b2NvbCIsInRlc3QiLCJwYXJzZUFyYW5nb0NvbmZpZyIsImNvbmZpZyIsImRlZk1heFNvY2tldHMiLCJsb3dlckNhc2VkIiwidHJpbSIsImhhc1Byb3RvY29sIiwic3RhcnRzV2l0aCIsInVybCIsIlVSTCIsInByb3RvY29sIiwiaG9zdCIsInBvcnQiLCJwYXRoIiwicGF0aG5hbWUiLCJwYXJhbSIsInNlYXJjaFBhcmFtcyIsImdldCIsInNlcnZlciIsImF1dGgiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwibWF4U29ja2V0cyIsIk51bWJlciIsInBhcnNlSW50IiwibGlzdGVuZXJSZXN0YXJ0VGltZW91dCIsInBhcnNlTWVtQ2FjaGVkQ29uZmlnIiwib3ZlcnJpZGVEZWZzIiwib3B0aW9ucyIsImRlZnMiLCJyZXNvbHZlZCIsIk9iamVjdCIsImVudHJpZXMiLCJmb3JFYWNoIiwidmFsdWUiLCJyZXNvbHZlVmFsdWVzIiwidmFsdWVzIiwiY3JlYXRlQ29uZmlnIiwiZGF0YSIsInNsb3dRdWVyaWVzRGF0YSIsInBhcnNlRGF0YUNvbmZpZyIsImtlZXBBbGl2ZSIsInJlcXVlc3RzIiwibW9kZSIsInJlcXVlc3RzU2VydmVyIiwidG9waWMiLCJyZXF1ZXN0c1RvcGljIiwiYXV0aG9yaXphdGlvbiIsImVuZHBvaW50IiwiYXV0aEVuZHBvaW50IiwibWFtQWNjZXNzS2V5cyIsIlNldCIsImphZWdlciIsImphZWdlckVuZHBvaW50Iiwic2VydmljZSIsInRyYWNlU2VydmljZSIsInRhZ3MiLCJwYXJzZVRhZ3MiLCJ0cmFjZVRhZ3MiLCJzdGF0c2QiLCJzdGF0c2RTZXJ2ZXIiLCJzdGF0c2RUYWdzIiwiZmlsdGVyIiwiaXB2NCIsIm9zIiwibmV0d29ya0ludGVyZmFjZXMiLCJyZWR1Y2UiLCJhY2MiLCJjb25jYXQiLCJmaW5kIiwiZmFtaWx5IiwiaW50ZXJuYWwiLCJ0IiwiaSIsImluZGV4T2YiLCJwYXJzZSIsInN1ZmZpeCIsIm11dCIsImhvdCIsImNvbGQiLCJjYWNoZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFtQkE7Ozs7QUFuQkE7Ozs7Ozs7Ozs7Ozs7Ozs7QUErRUEsTUFBTUEsZ0NBQWdDLEdBQUcsSUFBekM7QUFDQSxNQUFNQywwQkFBMEIsR0FBRyxHQUFuQztBQUNBLE1BQU1DLHVDQUF1QyxHQUFHLENBQWhEO0FBRU8sTUFBTUMsWUFBWSxHQUFHO0FBQ3hCQyxFQUFBQSxLQUFLLEVBQUUsT0FEaUI7QUFFeEJDLEVBQUFBLElBQUksRUFBRTtBQUZrQixDQUFyQjs7QUFLQSxNQUFNQyxjQUE4QixHQUFHLEVBQXZDOzs7QUFFUCxNQUFNQyxRQUFRLEdBQUdDLENBQUMsSUFBSyxHQUFFQSxDQUFDLENBQUMsQ0FBRCxDQUFELENBQUtDLFdBQUwsRUFBbUIsR0FBRUQsQ0FBQyxDQUFDRSxNQUFGLENBQVMsQ0FBVCxFQUFZQyxXQUFaLEVB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O0FBQ0hqQixNQUFBQSxJQUFJLENBQUNnQixDQUFELENBQUosR0FBVSxFQUFWO0FBQ0g7QUFDSixHQVBEO0FBUUEsU0FBT2hCLElBQVA7QUFFSDs7QUFHTSxTQUFTaEIsZUFBVCxDQUF5QkosTUFBekIsRUFHTDtBQUNFLFdBQVN1QyxLQUFULENBQWUvRixNQUFmLEVBQStCdUIsYUFBL0IsRUFBNEU7QUFDeEUsVUFBTXBDLEdBQUcsR0FBRzZHLE1BQU0sSUFBSXhDLE1BQU0sQ0FBRSxHQUFFeEQsTUFBTyxHQUFFZ0csTUFBTyxFQUFwQixDQUFOLElBQWdDLEVBQXREOztBQUNBLFdBQU87QUFDSEMsTUFBQUEsR0FBRyxFQUFFNUUsaUJBQWlCLENBQUNsQyxHQUFHLENBQUMsS0FBRCxDQUFKLEVBQWFvQyxhQUFiLENBRG5CO0FBRUgyRSxNQUFBQSxHQUFHLEVBQUU3RSxpQkFBaUIsQ0FBQ2xDLEdBQUcsQ0FBQyxLQUFELENBQUosRUFBYW9DLGFBQWIsQ0FGbkI7QUFHSDRFLE1BQUFBLElBQUksRUFBRWhILEdBQUcsQ0FBQyxNQUFELENBQUgsQ0FBWUssS0FBWixDQUFrQixHQUFsQixFQUF1QjBGLE1BQXZCLENBQThCcEYsQ0FBQyxJQUFJQSxDQUFuQyxFQUFzQ0gsR0FBdEMsQ0FBMENHLENBQUMsSUFBSXVCLGlCQUFpQixDQUFDdkIsQ0FBRCxFQUFJeUIsYUFBSixDQUFoRSxDQUhIO0FBSUg2RSxNQUFBQSxLQUFLLEVBQUV0RCxvQkFBb0IsQ0FBQzNELEdBQUcsQ0FBQyxPQUFELENBQUo7QUFKeEIsS0FBUDtBQU1IOztBQUVELFNBQU87QUFDSHVFLElBQUFBLElBQUksRUFBRXFDLEtBQUssQ0FBQyxNQUFELEVBQVN2SCwwQkFBVCxDQURSO0FBRUhtRixJQUFBQSxlQUFlLEVBQUVvQyxLQUFLLENBQUMsYUFBRCxFQUFnQnRILHVDQUFoQjtBQUZuQixHQUFQO0FBSUgiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuLypcbiAqIENvcHlyaWdodCAyMDE4LTIwMjAgVE9OIERFViBTT0xVVElPTlMgTFRELlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBTT0ZUV0FSRSBFVkFMVUFUSU9OIExpY2Vuc2UgKHRoZSBcIkxpY2Vuc2VcIik7IHlvdSBtYXkgbm90IHVzZVxuICogdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlXG4gKiBMaWNlbnNlIGF0OlxuICpcbiAqIGh0dHA6Ly93d3cudG9uLmRldi9saWNlbnNlc1xuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgVE9OIERFViBzb2Z0d2FyZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG4vLyBAZmxvd1xuXG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuXG4vLyBDb25maWcgU2NoZW1hXG5cbmV4cG9ydCB0eXBlIFFBcmFuZ29Db25maWcgPSB7XG4gICAgc2VydmVyOiBzdHJpbmcsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIGF1dGg6IHN0cmluZyxcbiAgICBtYXhTb2NrZXRzOiBudW1iZXIsXG4gICAgbGlzdGVuZXJSZXN0YXJ0VGltZW91dDogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgUU1lbUNhY2hlZENvbmZpZyA9IHtcbiAgICBzZXJ2ZXI6IHN0cmluZyxcbn07XG5cbmV4cG9ydCB0eXBlIFFEYXRhUHJvdmlkZXJzQ29uZmlnID0ge1xuICAgIG11dDogUUFyYW5nb0NvbmZpZztcbiAgICBob3Q6IFFBcmFuZ29Db25maWc7XG4gICAgY29sZDogUUFyYW5nb0NvbmZpZ1tdO1xuICAgIGNhY2hlOiBRTWVtQ2FjaGVkQ29uZmlnO1xufTtcblxuZXhwb3J0IHR5cGUgUUNvbmZpZyA9IHtcbiAgICBzZXJ2ZXI6IHtcbiAgICAgICAgaG9zdDogc3RyaW5nLFxuICAgICAgICBwb3J0OiBudW1iZXIsXG4gICAgICAgIGtlZXBBbGl2ZTogbnVtYmVyLFxuICAgIH0sXG4gICAgcmVxdWVzdHM6IHtcbiAgICAgICAgbW9kZTogJ2thZmthJyB8ICdyZXN0JyxcbiAgICAgICAgc2VydmVyOiBzdHJpbmcsXG4gICAgICAgIHRvcGljOiBzdHJpbmcsXG4gICAgfSxcbiAgICBkYXRhOiBRRGF0YVByb3ZpZGVyc0NvbmZpZyxcbiAgICBzbG93UXVlcmllc0RhdGE6IFFEYXRhUHJvdmlkZXJzQ29uZmlnLFxuICAgIGF1dGhvcml6YXRpb246IHtcbiAgICAgICAgZW5kcG9pbnQ6IHN0cmluZyxcbiAgICB9LFxuICAgIGphZWdlcjoge1xuICAgICAgICBlbmRwb2ludDogc3RyaW5nLFxuICAgICAgICBzZXJ2aWNlOiBzdHJpbmcsXG4gICAgICAgIHRhZ3M6IHsgW3N0cmluZ106IHN0cmluZyB9XG4gICAgfSxcbiAgICBzdGF0c2Q6IHtcbiAgICAgICAgc2VydmVyOiBzdHJpbmcsXG4gICAgICAgIHRhZ3M6IHN0cmluZ1tdLFxuICAgIH0sXG4gICAgbWFtQWNjZXNzS2V5czogU2V0PHN0cmluZz4sXG4gICAgaXNUZXN0cz86IGJvb2xlYW4sXG59XG5cbmV4cG9ydCB0eXBlIFByb2dyYW1PcHRpb24gPSB7XG4gICAgb3B0aW9uOiBzdHJpbmcsXG4gICAgZW52OiBzdHJpbmcsXG4gICAgZGVmOiBzdHJpbmcsXG4gICAgZGVzY3JpcHRpb246IHN0cmluZyxcbn07XG5leHBvcnQgdHlwZSBQcm9ncmFtT3B0aW9ucyA9IHsgW3N0cmluZ106IFByb2dyYW1PcHRpb24gfTtcblxuY29uc3QgREVGQVVMVF9MSVNURU5FUl9SRVNUQVJUX1RJTUVPVVQgPSAxMDAwO1xuY29uc3QgREVGQVVMVF9BUkFOR09fTUFYX1NPQ0tFVFMgPSAxMDA7XG5jb25zdCBERUZBVUxUX1NMT1dfUVVFUklFU19BUkFOR09fTUFYX1NPQ0tFVFMgPSAzO1xuXG5leHBvcnQgY29uc3QgcmVxdWVzdHNNb2RlID0ge1xuICAgIGthZmthOiAna2Fma2EnLFxuICAgIHJlc3Q6ICdyZXN0Jyxcbn07XG5cbmV4cG9ydCBjb25zdCBwcm9ncmFtT3B0aW9uczogUHJvZ3JhbU9wdGlvbnMgPSB7fTtcblxuY29uc3QgdG9QYXNjYWwgPSBzID0+IGAke3NbMF0udG9VcHBlckNhc2UoKX0ke3Muc3Vic3RyKDEpLnRvTG93ZXJDYXNlKCl9YDtcblxuY29uc3Qgb3B0ID0gKG9wdGlvbjogc3RyaW5nLCBkZWY6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IHdvcmRzID0gb3B0aW9uLnNwbGl0KCctJyk7XG4gICAgY29uc3QgbmFtZSA9IGAke3dvcmRzWzBdfSR7d29yZHMuc2xpY2UoMSkubWFwKHRvUGFzY2FsKS5qb2luKCcnKX1gO1xuICAgIGNvbnN0IGVudiA9IGBRXyR7d29yZHMubWFwKHggPT4geC50b1VwcGVyQ2FzZSgpKS5qb2luKCdfJyl9YDtcbiAgICBwcm9ncmFtT3B0aW9uc1tuYW1lXSA9IHtcbiAgICAgICAgb3B0aW9uOiBgLS0ke29wdGlvbn0gPHZhbHVlPmAsXG4gICAgICAgIGVudixcbiAgICAgICAgZGVmLFxuICAgICAgICBkZXNjcmlwdGlvbixcbiAgICB9XG59O1xuXG5jb25zdCBkYXRhT3B0ID0gKHByZWZpeDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgbyA9IG5hbWUgPT4gYCR7cHJlZml4LnRvTG93ZXJDYXNlKCkuc3BsaXQoJyAnKS5qb2luKCctJyl9LSR7bmFtZX1gO1xuICAgIGNvbnN0IGQgPSB0ZXh0ID0+IGAke3RvUGFzY2FsKHByZWZpeCl9ICR7dGV4dH1gO1xuXG4gICAgb3B0KG8oJ211dCcpLCAnYXJhbmdvZGInLCBkKCdtdXRhYmxlIGRiIGNvbmZpZyB1cmwnKSk7XG4gICAgb3B0KG8oJ2hvdCcpLCAnYXJhbmdvZGInLCBkKCdob3QgZGIgY29uZmlnIHVybCcpKTtcbiAgICBvcHQobygnY29sZCcpLCAnJywgZCgnY29sZCBkYiBjb25maWcgdXJscyAoY29tbWEgc2VwYXJhdGVkKScpKTtcbiAgICBvcHQobygnY2FjaGUnKSwgJycsIGQoJ2NhY2hlIGNvbmZpZyB1cmwnKSk7XG59XG5cbm9wdCgnaG9zdCcsIGdldElwKCksICdMaXN0ZW5pbmcgYWRkcmVzcycpO1xub3B0KCdwb3J0JywgJzQwMDAnLCAnTGlzdGVuaW5nIHBvcnQnKTtcbm9wdCgna2VlcC1hbGl2ZScsICc2MDAwMCcsICdHcmFwaFFMIGtlZXAgYWxpdmUgbXMnKTtcblxub3B0KCdyZXF1ZXN0cy1tb2RlJywgJ2thZmthJywgJ1JlcXVlc3RzIG1vZGUgKGthZmthIHwgcmVzdCknKTtcbm9wdCgncmVxdWVzdHMtc2VydmVyJywgJ2thZmthOjkwOTInLCAnUmVxdWVzdHMgc2VydmVyIHVybCcpO1xub3B0KCdyZXF1ZXN0cy10b3BpYycsICdyZXF1ZXN0cycsICdSZXF1ZXN0cyB0b3BpYyBuYW1lJyk7XG5cbmRhdGFPcHQoJ2RhdGEnKTtcbmRhdGFPcHQoJ3Nsb3cgcXVlcmllcycpO1xuXG5vcHQoJ2F1dGgtZW5kcG9pbnQnLCAnJywgJ0F1dGggZW5kcG9pbnQnKTtcbm9wdCgnbWFtLWFjY2Vzcy1rZXlzJywgJycsICdBY2Nlc3Mga2V5cyB1c2VkIHRvIGF1dGhvcml6ZSBtYW0gZW5kcG9pbnQgYWNjZXNzJyk7XG5cbm9wdCgnamFlZ2VyLWVuZHBvaW50JywgJycsICdKYWVnZXIgZW5kcG9pbnQnKTtcbm9wdCgndHJhY2Utc2VydmljZScsICdRIFNlcnZlcicsICdUcmFjZSBzZXJ2aWNlIG5hbWUnKTtcbm9wdCgndHJhY2UtdGFncycsICcnLCAnQWRkaXRpb25hbCB0cmFjZSB0YWdzIChjb21tYSBzZXBhcmF0ZWQgbmFtZT12YWx1ZSBwYWlycyknKTtcblxub3B0KCdzdGF0c2Qtc2VydmVyJywgJycsICdTdGF0c0Qgc2VydmVyIChob3N0OnBvcnQpJyk7XG5vcHQoJ3N0YXRzZC10YWdzJywgJycsICdBZGRpdGlvbmFsIFN0YXRzRCB0YWdzIChjb21tYSBzZXBhcmF0ZWQgbmFtZT12YWx1ZSBwYWlycyknKTtcblxuLy8gU3RhdHMgU2NoZW1hXG5cbmV4cG9ydCBjb25zdCBTVEFUUyA9IHtcbiAgICBzdGFydDogJ3N0YXJ0JyxcbiAgICBwcmVmaXg6ICdxc2VydmVyLicsXG4gICAgZG9jOiB7XG4gICAgICAgIGNvdW50OiAnZG9jLmNvdW50JyxcbiAgICB9LFxuICAgIHBvc3Q6IHtcbiAgICAgICAgY291bnQ6ICdwb3N0LmNvdW50JyxcbiAgICAgICAgZmFpbGVkOiAncG9zdC5mYWlsZWQnLFxuICAgIH0sXG4gICAgcXVlcnk6IHtcbiAgICAgICAgY291bnQ6ICdxdWVyeS5jb3VudCcsXG4gICAgICAgIHRpbWU6ICdxdWVyeS50aW1lJyxcbiAgICAgICAgYWN0aXZlOiAncXVlcnkuYWN0aXZlJyxcbiAgICAgICAgZmFpbGVkOiAncXVlcnkuZmFpbGVkJyxcbiAgICAgICAgc2xvdzogJ3F1ZXJ5LnNsb3cnLFxuICAgIH0sXG4gICAgc3Vic2NyaXB0aW9uOiB7XG4gICAgICAgIGFjdGl2ZTogJ3N1YnNjcmlwdGlvbi5hY3RpdmUnLFxuICAgIH0sXG4gICAgd2FpdEZvcjoge1xuICAgICAgICBhY3RpdmU6ICd3YWl0Zm9yLmFjdGl2ZScsXG4gICAgfSxcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVByb3RvY29sKGFkZHJlc3M6IHN0cmluZywgZGVmYXVsdFByb3RvY29sOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiAvXlxcdys6XFwvXFwvL2dpLnRlc3QoYWRkcmVzcykgPyBhZGRyZXNzIDogYCR7ZGVmYXVsdFByb3RvY29sfTovLyR7YWRkcmVzc31gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBcmFuZ29Db25maWcoY29uZmlnOiBzdHJpbmcsIGRlZk1heFNvY2tldHM6IG51bWJlcik6IFFBcmFuZ29Db25maWcge1xuICAgIGNvbnN0IGxvd2VyQ2FzZWQgPSBjb25maWcudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgY29uc3QgaGFzUHJvdG9jb2wgPSBsb3dlckNhc2VkLnN0YXJ0c1dpdGgoJ2h0dHA6JykgfHwgbG93ZXJDYXNlZC5zdGFydHNXaXRoKCdodHRwczonKTtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKGhhc1Byb3RvY29sID8gY29uZmlnIDogYGh0dHBzOi8vJHtjb25maWd9YCk7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwucHJvdG9jb2wgfHwgJ2h0dHBzOic7XG4gICAgY29uc3QgaG9zdCA9ICh1cmwucG9ydCB8fCBwcm90b2NvbC50b0xvd2VyQ2FzZSgpID09PSAnaHR0cHM6JykgPyB1cmwuaG9zdCA6IGAke3VybC5ob3N0fTo4MDU5YDtcbiAgICBjb25zdCBwYXRoID0gdXJsLnBhdGhuYW1lICE9PSAnLycgPyB1cmwucGF0aG5hbWUgOiAnJztcbiAgICBjb25zdCBwYXJhbSA9IG5hbWUgPT4gdXJsLnNlYXJjaFBhcmFtcy5nZXQobmFtZSkgfHwgJyc7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2VydmVyOiBgJHtwcm90b2NvbH0vLyR7aG9zdH0ke3BhdGh9YCxcbiAgICAgICAgYXV0aDogdXJsLnVzZXJuYW1lICYmIGAke3VybC51c2VybmFtZX06JHt1cmwucGFzc3dvcmR9YCxcbiAgICAgICAgbmFtZTogcGFyYW0oJ25hbWUnKSB8fCAnYmxvY2tjaGFpbicsXG4gICAgICAgIG1heFNvY2tldHM6IE51bWJlci5wYXJzZUludChwYXJhbSgnbWF4U29ja2V0cycpKSB8fCBkZWZNYXhTb2NrZXRzLFxuICAgICAgICBsaXN0ZW5lclJlc3RhcnRUaW1lb3V0OiBOdW1iZXIucGFyc2VJbnQocGFyYW0oJ2xpc3RlbmVyUmVzdGFydFRpbWVvdXQnKSkgfHwgREVGQVVMVF9MSVNURU5FUl9SRVNUQVJUX1RJTUVPVVQsXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNZW1DYWNoZWRDb25maWcoY29uZmlnOiBzdHJpbmcpOiBRTWVtQ2FjaGVkQ29uZmlnIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXJ2ZXI6IGNvbmZpZyxcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvdmVycmlkZURlZnMob3B0aW9uczogUHJvZ3JhbU9wdGlvbnMsIGRlZnM6IGFueSk6IFByb2dyYW1PcHRpb25zIHtcbiAgICBjb25zdCByZXNvbHZlZCA9IHt9O1xuICAgIE9iamVjdC5lbnRyaWVzKG9wdGlvbnMpLmZvckVhY2goKFtuYW1lLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3Qgb3B0ID0gKCh2YWx1ZTogYW55KTogUHJvZ3JhbU9wdGlvbik7XG4gICAgICAgIHJlc29sdmVkW25hbWVdID0ge1xuICAgICAgICAgICAgLi4ub3B0LFxuICAgICAgICAgICAgZGVmOiBkZWZzW25hbWVdIHx8IG9wdC5kZWYsXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc29sdmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVZhbHVlcyh2YWx1ZXM6IGFueSwgZW52OiBhbnksIGRlZjogUHJvZ3JhbU9wdGlvbnMpOiBhbnkge1xuICAgIGNvbnN0IHJlc29sdmVkID0ge307XG4gICAgT2JqZWN0LmVudHJpZXMoZGVmKS5mb3JFYWNoKChbbmFtZSwgdmFsdWVdKSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdCA9ICgodmFsdWU6IGFueSk6IFByb2dyYW1PcHRpb24pO1xuICAgICAgICByZXNvbHZlZFtuYW1lXSA9IHZhbHVlc1tuYW1lXSB8fCBlbnZbb3B0LmVudl0gfHwgZGVmW25hbWVdLmRlZjtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzb2x2ZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb25maWcoXG4gICAgdmFsdWVzOiBhbnksXG4gICAgZW52OiBhbnksXG4gICAgZGVmOiBQcm9ncmFtT3B0aW9ucyxcbik6IFFDb25maWcge1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhbHVlcyh2YWx1ZXMsIGVudiwgZGVmKTtcbiAgICBjb25zdCB7IGRhdGEsIHNsb3dRdWVyaWVzRGF0YSB9ID0gcGFyc2VEYXRhQ29uZmlnKHJlc29sdmVkKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXJ2ZXI6IHtcbiAgICAgICAgICAgIGhvc3Q6IHJlc29sdmVkLmhvc3QsXG4gICAgICAgICAgICBwb3J0OiBOdW1iZXIucGFyc2VJbnQocmVzb2x2ZWQucG9ydCksXG4gICAgICAgICAgICBrZWVwQWxpdmU6IE51bWJlci5wYXJzZUludChyZXNvbHZlZC5rZWVwQWxpdmUpLFxuICAgICAgICB9LFxuICAgICAgICByZXF1ZXN0czoge1xuICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWQucmVxdWVzdHNNb2RlLFxuICAgICAgICAgICAgc2VydmVyOiByZXNvbHZlZC5yZXF1ZXN0c1NlcnZlcixcbiAgICAgICAgICAgIHRvcGljOiByZXNvbHZlZC5yZXF1ZXN0c1RvcGljLFxuICAgICAgICB9LFxuICAgICAgICBkYXRhLFxuICAgICAgICBzbG93UXVlcmllc0RhdGEsXG4gICAgICAgIGF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZC5hdXRoRW5kcG9pbnQsXG4gICAgICAgIH0sXG4gICAgICAgIG1hbUFjY2Vzc0tleXM6IG5ldyBTZXQoKHJlc29sdmVkLm1hbUFjY2Vzc0tleXMgfHwgJycpLnNwbGl0KCcsJykpLFxuICAgICAgICBqYWVnZXI6IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZC5qYWVnZXJFbmRwb2ludCxcbiAgICAgICAgICAgIHNlcnZpY2U6IHJlc29sdmVkLnRyYWNlU2VydmljZSxcbiAgICAgICAgICAgIHRhZ3M6IHBhcnNlVGFncyhyZXNvbHZlZC50cmFjZVRhZ3MpLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0c2Q6IHtcbiAgICAgICAgICAgIHNlcnZlcjogcmVzb2x2ZWQuc3RhdHNkU2VydmVyLFxuICAgICAgICAgICAgdGFnczogKHJlc29sdmVkLnN0YXRzZFRhZ3MgfHwgJycpLnNwbGl0KCcsJykubWFwKHggPT4geC50cmltKCkpLmZpbHRlcih4ID0+IHgpLFxuICAgICAgICB9LFxuICAgIH07XG59XG5cbi8vIEludGVybmFsc1xuXG5mdW5jdGlvbiBnZXRJcCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IGlwdjQgPSAoT2JqZWN0LnZhbHVlcyhvcy5uZXR3b3JrSW50ZXJmYWNlcygpKTogYW55KVxuICAgICAgICAucmVkdWNlKChhY2MsIHgpID0+IGFjYy5jb25jYXQoeCksIFtdKVxuICAgICAgICAuZmluZCh4ID0+IHguZmFtaWx5ID09PSAnSVB2NCcgJiYgIXguaW50ZXJuYWwpO1xuICAgIHJldHVybiBpcHY0ICYmIGlwdjQuYWRkcmVzcztcbn1cblxuXG5mdW5jdGlvbiBwYXJzZVRhZ3Moczogc3RyaW5nKTogeyBbc3RyaW5nXTogc3RyaW5nIH0ge1xuICAgIGNvbnN0IHRhZ3M6IHsgW3N0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgcy5zcGxpdCgnLCcpLmZvckVhY2goKHQpID0+IHtcbiAgICAgICAgY29uc3QgaSA9IHQuaW5kZXhPZignPScpO1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICB0YWdzW3Quc3Vic3RyKDAsIGkpXSA9IHQuc3Vic3RyKGkgKyAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRhZ3NbdF0gPSAnJztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiB0YWdzO1xuXG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRGF0YUNvbmZpZyh2YWx1ZXM6IGFueSk6IHtcbiAgICBkYXRhOiBRRGF0YVByb3ZpZGVyc0NvbmZpZyxcbiAgICBzbG93UXVlcmllc0RhdGE6IFFEYXRhUHJvdmlkZXJzQ29uZmlnLFxufSB7XG4gICAgZnVuY3Rpb24gcGFyc2UocHJlZml4OiBzdHJpbmcsIGRlZk1heFNvY2tldHM6IG51bWJlcik6IFFEYXRhUHJvdmlkZXJzQ29uZmlnIHtcbiAgICAgICAgY29uc3Qgb3B0ID0gc3VmZml4ID0+IHZhbHVlc1tgJHtwcmVmaXh9JHtzdWZmaXh9YF0gfHwgJyc7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtdXQ6IHBhcnNlQXJhbmdvQ29uZmlnKG9wdCgnTXV0JyksIGRlZk1heFNvY2tldHMpLFxuICAgICAgICAgICAgaG90OiBwYXJzZUFyYW5nb0NvbmZpZyhvcHQoJ0hvdCcpLCBkZWZNYXhTb2NrZXRzKSxcbiAgICAgICAgICAgIGNvbGQ6IG9wdCgnQ29sZCcpLnNwbGl0KCcsJykuZmlsdGVyKHggPT4geCkubWFwKHggPT4gcGFyc2VBcmFuZ29Db25maWcoeCwgZGVmTWF4U29ja2V0cykpLFxuICAgICAgICAgICAgY2FjaGU6IHBhcnNlTWVtQ2FjaGVkQ29uZmlnKG9wdCgnQ2FjaGUnKSksXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBkYXRhOiBwYXJzZSgnZGF0YScsIERFRkFVTFRfQVJBTkdPX01BWF9TT0NLRVRTKSxcbiAgICAgICAgc2xvd1F1ZXJpZXNEYXRhOiBwYXJzZSgnc2xvd1F1ZXJpZXMnLCBERUZBVUxUX1NMT1dfUVVFUklFU19BUkFOR09fTUFYX1NPQ0tFVFMpLFxuICAgIH07XG59XG4iXX0=