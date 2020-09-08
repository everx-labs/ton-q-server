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
    description: `${description}${def && ` (default: "${def}")`}`
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
  const host = url.port || protocol.toLowerCase() === 'https:' ? url.host : `${url.host}:8529`;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXJ2ZXIvY29uZmlnLmpzIl0sIm5hbWVzIjpbIkRFRkFVTFRfTElTVEVORVJfUkVTVEFSVF9USU1FT1VUIiwiREVGQVVMVF9BUkFOR09fTUFYX1NPQ0tFVFMiLCJERUZBVUxUX1NMT1dfUVVFUklFU19BUkFOR09fTUFYX1NPQ0tFVFMiLCJyZXF1ZXN0c01vZGUiLCJrYWZrYSIsInJlc3QiLCJwcm9ncmFtT3B0aW9ucyIsInRvUGFzY2FsIiwicyIsInRvVXBwZXJDYXNlIiwic3Vic3RyIiwidG9Mb3dlckNhc2UiLCJvcHQiLCJvcHRpb24iLCJkZWYiLCJkZXNjcmlwdGlvbiIsIndvcmRzIiwic3BsaXQiLCJuYW1lIiwic2xpY2UiLCJtYXAiLCJqb2luIiwiZW52IiwieCIsImRhdGFPcHQiLCJwcmVmaXgiLCJvIiwiZCIsInRleHQiLCJnZXRJcCIsIlNUQVRTIiwic3RhcnQiLCJkb2MiLCJjb3VudCIsInBvc3QiLCJmYWlsZWQiLCJxdWVyeSIsInRpbWUiLCJhY3RpdmUiLCJzbG93Iiwic3Vic2NyaXB0aW9uIiwid2FpdEZvciIsImVuc3VyZVByb3RvY29sIiwiYWRkcmVzcyIsImRlZmF1bHRQcm90b2NvbCIsInRlc3QiLCJwYXJzZUFyYW5nb0NvbmZpZyIsImNvbmZpZyIsImRlZk1heFNvY2tldHMiLCJsb3dlckNhc2VkIiwidHJpbSIsImhhc1Byb3RvY29sIiwic3RhcnRzV2l0aCIsInVybCIsIlVSTCIsInByb3RvY29sIiwiaG9zdCIsInBvcnQiLCJwYXRoIiwicGF0aG5hbWUiLCJwYXJhbSIsInNlYXJjaFBhcmFtcyIsImdldCIsInNlcnZlciIsImF1dGgiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwibWF4U29ja2V0cyIsIk51bWJlciIsInBhcnNlSW50IiwibGlzdGVuZXJSZXN0YXJ0VGltZW91dCIsInBhcnNlTWVtQ2FjaGVkQ29uZmlnIiwib3ZlcnJpZGVEZWZzIiwib3B0aW9ucyIsImRlZnMiLCJyZXNvbHZlZCIsIk9iamVjdCIsImVudHJpZXMiLCJmb3JFYWNoIiwidmFsdWUiLCJyZXNvbHZlVmFsdWVzIiwidmFsdWVzIiwiY3JlYXRlQ29uZmlnIiwiZGF0YSIsInNsb3dRdWVyaWVzRGF0YSIsInBhcnNlRGF0YUNvbmZpZyIsImtlZXBBbGl2ZSIsInJlcXVlc3RzIiwibW9kZSIsInJlcXVlc3RzU2VydmVyIiwidG9waWMiLCJyZXF1ZXN0c1RvcGljIiwiYXV0aG9yaXphdGlvbiIsImVuZHBvaW50IiwiYXV0aEVuZHBvaW50IiwibWFtQWNjZXNzS2V5cyIsIlNldCIsImphZWdlciIsImphZWdlckVuZHBvaW50Iiwic2VydmljZSIsInRyYWNlU2VydmljZSIsInRhZ3MiLCJwYXJzZVRhZ3MiLCJ0cmFjZVRhZ3MiLCJzdGF0c2QiLCJzdGF0c2RTZXJ2ZXIiLCJzdGF0c2RUYWdzIiwiZmlsdGVyIiwiaXB2NCIsIm9zIiwibmV0d29ya0ludGVyZmFjZXMiLCJyZWR1Y2UiLCJhY2MiLCJjb25jYXQiLCJmaW5kIiwiZmFtaWx5IiwiaW50ZXJuYWwiLCJ0IiwiaSIsImluZGV4T2YiLCJwYXJzZSIsInN1ZmZpeCIsIm11dCIsImhvdCIsImNvbGQiLCJjYWNoZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFtQkE7Ozs7QUFuQkE7Ozs7Ozs7Ozs7Ozs7Ozs7QUErRUEsTUFBTUEsZ0NBQWdDLEdBQUcsSUFBekM7QUFDQSxNQUFNQywwQkFBMEIsR0FBRyxHQUFuQztBQUNBLE1BQU1DLHVDQUF1QyxHQUFHLENBQWhEO0FBRU8sTUFBTUMsWUFBWSxHQUFHO0FBQ3hCQyxFQUFBQSxLQUFLLEVBQUUsT0FEaUI7QUFFeEJDLEVBQUFBLElBQUksRUFBRTtBQUZrQixDQUFyQjs7QUFLQSxNQUFNQyxjQUE4QixHQUFHLEVBQXZDOzs7QUFFUCxNQUFNQyxRQUFRLEdBQUdDLENBQUMsSUFBSyxHQUFFQSxDQUFDLENBQUMsQ0FBRCxDQUFELENBQUtDLFdBQUwsRUFBbUIsR0FBRUQsQ0FBQyxDQUFDRSxNQUFGLENBQVMsQ0FBVCxFQUFZQyxXQUFaLEVB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KlxuICogQ29weXJpZ2h0IDIwMTgtMjAyMCBUT04gREVWIFNPTFVUSU9OUyBMVEQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIFNPRlRXQVJFIEVWQUxVQVRJT04gTGljZW5zZSAodGhlIFwiTGljZW5zZVwiKTsgeW91IG1heSBub3QgdXNlXG4gKiB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS4gIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGVcbiAqIExpY2Vuc2UgYXQ6XG4gKlxuICogaHR0cDovL3d3dy50b24uZGV2L2xpY2Vuc2VzXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBUT04gREVWIHNvZnR3YXJlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbi8vIEBmbG93XG5cbmltcG9ydCBvcyBmcm9tICdvcyc7XG5cbi8vIENvbmZpZyBTY2hlbWFcblxuZXhwb3J0IHR5cGUgUUFyYW5nb0NvbmZpZyA9IHtcbiAgICBzZXJ2ZXI6IHN0cmluZyxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgYXV0aDogc3RyaW5nLFxuICAgIG1heFNvY2tldHM6IG51bWJlcixcbiAgICBsaXN0ZW5lclJlc3RhcnRUaW1lb3V0OiBudW1iZXI7XG59O1xuXG5leHBvcnQgdHlwZSBRTWVtQ2FjaGVkQ29uZmlnID0ge1xuICAgIHNlcnZlcjogc3RyaW5nLFxufTtcblxuZXhwb3J0IHR5cGUgUURhdGFQcm92aWRlcnNDb25maWcgPSB7XG4gICAgbXV0OiBRQXJhbmdvQ29uZmlnO1xuICAgIGhvdDogUUFyYW5nb0NvbmZpZztcbiAgICBjb2xkOiBRQXJhbmdvQ29uZmlnW107XG4gICAgY2FjaGU6IFFNZW1DYWNoZWRDb25maWc7XG59O1xuXG5leHBvcnQgdHlwZSBRQ29uZmlnID0ge1xuICAgIHNlcnZlcjoge1xuICAgICAgICBob3N0OiBzdHJpbmcsXG4gICAgICAgIHBvcnQ6IG51bWJlcixcbiAgICAgICAga2VlcEFsaXZlOiBudW1iZXIsXG4gICAgfSxcbiAgICByZXF1ZXN0czoge1xuICAgICAgICBtb2RlOiAna2Fma2EnIHwgJ3Jlc3QnLFxuICAgICAgICBzZXJ2ZXI6IHN0cmluZyxcbiAgICAgICAgdG9waWM6IHN0cmluZyxcbiAgICB9LFxuICAgIGRhdGE6IFFEYXRhUHJvdmlkZXJzQ29uZmlnLFxuICAgIHNsb3dRdWVyaWVzRGF0YTogUURhdGFQcm92aWRlcnNDb25maWcsXG4gICAgYXV0aG9yaXphdGlvbjoge1xuICAgICAgICBlbmRwb2ludDogc3RyaW5nLFxuICAgIH0sXG4gICAgamFlZ2VyOiB7XG4gICAgICAgIGVuZHBvaW50OiBzdHJpbmcsXG4gICAgICAgIHNlcnZpY2U6IHN0cmluZyxcbiAgICAgICAgdGFnczogeyBbc3RyaW5nXTogc3RyaW5nIH1cbiAgICB9LFxuICAgIHN0YXRzZDoge1xuICAgICAgICBzZXJ2ZXI6IHN0cmluZyxcbiAgICAgICAgdGFnczogc3RyaW5nW10sXG4gICAgfSxcbiAgICBtYW1BY2Nlc3NLZXlzOiBTZXQ8c3RyaW5nPixcbiAgICBpc1Rlc3RzPzogYm9vbGVhbixcbn1cblxuZXhwb3J0IHR5cGUgUHJvZ3JhbU9wdGlvbiA9IHtcbiAgICBvcHRpb246IHN0cmluZyxcbiAgICBlbnY6IHN0cmluZyxcbiAgICBkZWY6IHN0cmluZyxcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nLFxufTtcbmV4cG9ydCB0eXBlIFByb2dyYW1PcHRpb25zID0geyBbc3RyaW5nXTogUHJvZ3JhbU9wdGlvbiB9O1xuXG5jb25zdCBERUZBVUxUX0xJU1RFTkVSX1JFU1RBUlRfVElNRU9VVCA9IDEwMDA7XG5jb25zdCBERUZBVUxUX0FSQU5HT19NQVhfU09DS0VUUyA9IDEwMDtcbmNvbnN0IERFRkFVTFRfU0xPV19RVUVSSUVTX0FSQU5HT19NQVhfU09DS0VUUyA9IDM7XG5cbmV4cG9ydCBjb25zdCByZXF1ZXN0c01vZGUgPSB7XG4gICAga2Fma2E6ICdrYWZrYScsXG4gICAgcmVzdDogJ3Jlc3QnLFxufTtcblxuZXhwb3J0IGNvbnN0IHByb2dyYW1PcHRpb25zOiBQcm9ncmFtT3B0aW9ucyA9IHt9O1xuXG5jb25zdCB0b1Bhc2NhbCA9IHMgPT4gYCR7c1swXS50b1VwcGVyQ2FzZSgpfSR7cy5zdWJzdHIoMSkudG9Mb3dlckNhc2UoKX1gO1xuXG5jb25zdCBvcHQgPSAob3B0aW9uOiBzdHJpbmcsIGRlZjogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKSA9PiB7XG4gICAgY29uc3Qgd29yZHMgPSBvcHRpb24uc3BsaXQoJy0nKTtcbiAgICBjb25zdCBuYW1lID0gYCR7d29yZHNbMF19JHt3b3Jkcy5zbGljZSgxKS5tYXAodG9QYXNjYWwpLmpvaW4oJycpfWA7XG4gICAgY29uc3QgZW52ID0gYFFfJHt3b3Jkcy5tYXAoeCA9PiB4LnRvVXBwZXJDYXNlKCkpLmpvaW4oJ18nKX1gO1xuICAgIHByb2dyYW1PcHRpb25zW25hbWVdID0ge1xuICAgICAgICBvcHRpb246IGAtLSR7b3B0aW9ufSA8dmFsdWU+YCxcbiAgICAgICAgZW52LFxuICAgICAgICBkZWYsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgJHtkZXNjcmlwdGlvbn0ke2RlZiAmJiBgIChkZWZhdWx0OiBcIiR7ZGVmfVwiKWB9YCxcbiAgICB9XG59O1xuXG5jb25zdCBkYXRhT3B0ID0gKHByZWZpeDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgbyA9IG5hbWUgPT4gYCR7cHJlZml4LnRvTG93ZXJDYXNlKCkuc3BsaXQoJyAnKS5qb2luKCctJyl9LSR7bmFtZX1gO1xuICAgIGNvbnN0IGQgPSB0ZXh0ID0+IGAke3RvUGFzY2FsKHByZWZpeCl9ICR7dGV4dH1gO1xuXG4gICAgb3B0KG8oJ211dCcpLCAnYXJhbmdvZGInLCBkKCdtdXRhYmxlIGRiIGNvbmZpZyB1cmwnKSk7XG4gICAgb3B0KG8oJ2hvdCcpLCAnYXJhbmdvZGInLCBkKCdob3QgZGIgY29uZmlnIHVybCcpKTtcbiAgICBvcHQobygnY29sZCcpLCAnJywgZCgnY29sZCBkYiBjb25maWcgdXJscyAoY29tbWEgc2VwYXJhdGVkKScpKTtcbiAgICBvcHQobygnY2FjaGUnKSwgJycsIGQoJ2NhY2hlIGNvbmZpZyB1cmwnKSk7XG59XG5cbm9wdCgnaG9zdCcsIGdldElwKCksICdMaXN0ZW5pbmcgYWRkcmVzcycpO1xub3B0KCdwb3J0JywgJzQwMDAnLCAnTGlzdGVuaW5nIHBvcnQnKTtcbm9wdCgna2VlcC1hbGl2ZScsICc2MDAwMCcsICdHcmFwaFFMIGtlZXAgYWxpdmUgbXMnKTtcblxub3B0KCdyZXF1ZXN0cy1tb2RlJywgJ2thZmthJywgJ1JlcXVlc3RzIG1vZGUgKGthZmthIHwgcmVzdCknKTtcbm9wdCgncmVxdWVzdHMtc2VydmVyJywgJ2thZmthOjkwOTInLCAnUmVxdWVzdHMgc2VydmVyIHVybCcpO1xub3B0KCdyZXF1ZXN0cy10b3BpYycsICdyZXF1ZXN0cycsICdSZXF1ZXN0cyB0b3BpYyBuYW1lJyk7XG5cbmRhdGFPcHQoJ2RhdGEnKTtcbmRhdGFPcHQoJ3Nsb3cgcXVlcmllcycpO1xuXG5vcHQoJ2F1dGgtZW5kcG9pbnQnLCAnJywgJ0F1dGggZW5kcG9pbnQnKTtcbm9wdCgnbWFtLWFjY2Vzcy1rZXlzJywgJycsICdBY2Nlc3Mga2V5cyB1c2VkIHRvIGF1dGhvcml6ZSBtYW0gZW5kcG9pbnQgYWNjZXNzJyk7XG5cbm9wdCgnamFlZ2VyLWVuZHBvaW50JywgJycsICdKYWVnZXIgZW5kcG9pbnQnKTtcbm9wdCgndHJhY2Utc2VydmljZScsICdRIFNlcnZlcicsICdUcmFjZSBzZXJ2aWNlIG5hbWUnKTtcbm9wdCgndHJhY2UtdGFncycsICcnLCAnQWRkaXRpb25hbCB0cmFjZSB0YWdzIChjb21tYSBzZXBhcmF0ZWQgbmFtZT12YWx1ZSBwYWlycyknKTtcblxub3B0KCdzdGF0c2Qtc2VydmVyJywgJycsICdTdGF0c0Qgc2VydmVyIChob3N0OnBvcnQpJyk7XG5vcHQoJ3N0YXRzZC10YWdzJywgJycsICdBZGRpdGlvbmFsIFN0YXRzRCB0YWdzIChjb21tYSBzZXBhcmF0ZWQgbmFtZT12YWx1ZSBwYWlycyknKTtcblxuLy8gU3RhdHMgU2NoZW1hXG5cbmV4cG9ydCBjb25zdCBTVEFUUyA9IHtcbiAgICBzdGFydDogJ3N0YXJ0JyxcbiAgICBwcmVmaXg6ICdxc2VydmVyLicsXG4gICAgZG9jOiB7XG4gICAgICAgIGNvdW50OiAnZG9jLmNvdW50JyxcbiAgICB9LFxuICAgIHBvc3Q6IHtcbiAgICAgICAgY291bnQ6ICdwb3N0LmNvdW50JyxcbiAgICAgICAgZmFpbGVkOiAncG9zdC5mYWlsZWQnLFxuICAgIH0sXG4gICAgcXVlcnk6IHtcbiAgICAgICAgY291bnQ6ICdxdWVyeS5jb3VudCcsXG4gICAgICAgIHRpbWU6ICdxdWVyeS50aW1lJyxcbiAgICAgICAgYWN0aXZlOiAncXVlcnkuYWN0aXZlJyxcbiAgICAgICAgZmFpbGVkOiAncXVlcnkuZmFpbGVkJyxcbiAgICAgICAgc2xvdzogJ3F1ZXJ5LnNsb3cnLFxuICAgIH0sXG4gICAgc3Vic2NyaXB0aW9uOiB7XG4gICAgICAgIGFjdGl2ZTogJ3N1YnNjcmlwdGlvbi5hY3RpdmUnLFxuICAgIH0sXG4gICAgd2FpdEZvcjoge1xuICAgICAgICBhY3RpdmU6ICd3YWl0Zm9yLmFjdGl2ZScsXG4gICAgfSxcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVByb3RvY29sKGFkZHJlc3M6IHN0cmluZywgZGVmYXVsdFByb3RvY29sOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiAvXlxcdys6XFwvXFwvL2dpLnRlc3QoYWRkcmVzcykgPyBhZGRyZXNzIDogYCR7ZGVmYXVsdFByb3RvY29sfTovLyR7YWRkcmVzc31gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBcmFuZ29Db25maWcoY29uZmlnOiBzdHJpbmcsIGRlZk1heFNvY2tldHM6IG51bWJlcik6IFFBcmFuZ29Db25maWcge1xuICAgIGNvbnN0IGxvd2VyQ2FzZWQgPSBjb25maWcudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgY29uc3QgaGFzUHJvdG9jb2wgPSBsb3dlckNhc2VkLnN0YXJ0c1dpdGgoJ2h0dHA6JykgfHwgbG93ZXJDYXNlZC5zdGFydHNXaXRoKCdodHRwczonKTtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKGhhc1Byb3RvY29sID8gY29uZmlnIDogYGh0dHBzOi8vJHtjb25maWd9YCk7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwucHJvdG9jb2wgfHwgJ2h0dHBzOic7XG4gICAgY29uc3QgaG9zdCA9ICh1cmwucG9ydCB8fCBwcm90b2NvbC50b0xvd2VyQ2FzZSgpID09PSAnaHR0cHM6JykgPyB1cmwuaG9zdCA6IGAke3VybC5ob3N0fTo4NTI5YDtcbiAgICBjb25zdCBwYXRoID0gdXJsLnBhdGhuYW1lICE9PSAnLycgPyB1cmwucGF0aG5hbWUgOiAnJztcbiAgICBjb25zdCBwYXJhbSA9IG5hbWUgPT4gdXJsLnNlYXJjaFBhcmFtcy5nZXQobmFtZSkgfHwgJyc7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2VydmVyOiBgJHtwcm90b2NvbH0vLyR7aG9zdH0ke3BhdGh9YCxcbiAgICAgICAgYXV0aDogdXJsLnVzZXJuYW1lICYmIGAke3VybC51c2VybmFtZX06JHt1cmwucGFzc3dvcmR9YCxcbiAgICAgICAgbmFtZTogcGFyYW0oJ25hbWUnKSB8fCAnYmxvY2tjaGFpbicsXG4gICAgICAgIG1heFNvY2tldHM6IE51bWJlci5wYXJzZUludChwYXJhbSgnbWF4U29ja2V0cycpKSB8fCBkZWZNYXhTb2NrZXRzLFxuICAgICAgICBsaXN0ZW5lclJlc3RhcnRUaW1lb3V0OiBOdW1iZXIucGFyc2VJbnQocGFyYW0oJ2xpc3RlbmVyUmVzdGFydFRpbWVvdXQnKSkgfHwgREVGQVVMVF9MSVNURU5FUl9SRVNUQVJUX1RJTUVPVVQsXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNZW1DYWNoZWRDb25maWcoY29uZmlnOiBzdHJpbmcpOiBRTWVtQ2FjaGVkQ29uZmlnIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXJ2ZXI6IGNvbmZpZyxcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvdmVycmlkZURlZnMob3B0aW9uczogUHJvZ3JhbU9wdGlvbnMsIGRlZnM6IGFueSk6IFByb2dyYW1PcHRpb25zIHtcbiAgICBjb25zdCByZXNvbHZlZCA9IHt9O1xuICAgIE9iamVjdC5lbnRyaWVzKG9wdGlvbnMpLmZvckVhY2goKFtuYW1lLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3Qgb3B0ID0gKCh2YWx1ZTogYW55KTogUHJvZ3JhbU9wdGlvbik7XG4gICAgICAgIHJlc29sdmVkW25hbWVdID0ge1xuICAgICAgICAgICAgLi4ub3B0LFxuICAgICAgICAgICAgZGVmOiBkZWZzW25hbWVdIHx8IG9wdC5kZWYsXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc29sdmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVZhbHVlcyh2YWx1ZXM6IGFueSwgZW52OiBhbnksIGRlZjogUHJvZ3JhbU9wdGlvbnMpOiBhbnkge1xuICAgIGNvbnN0IHJlc29sdmVkID0ge307XG4gICAgT2JqZWN0LmVudHJpZXMoZGVmKS5mb3JFYWNoKChbbmFtZSwgdmFsdWVdKSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdCA9ICgodmFsdWU6IGFueSk6IFByb2dyYW1PcHRpb24pO1xuICAgICAgICByZXNvbHZlZFtuYW1lXSA9IHZhbHVlc1tuYW1lXSB8fCBlbnZbb3B0LmVudl0gfHwgZGVmW25hbWVdLmRlZjtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzb2x2ZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb25maWcoXG4gICAgdmFsdWVzOiBhbnksXG4gICAgZW52OiBhbnksXG4gICAgZGVmOiBQcm9ncmFtT3B0aW9ucyxcbik6IFFDb25maWcge1xuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhbHVlcyh2YWx1ZXMsIGVudiwgZGVmKTtcbiAgICBjb25zdCB7IGRhdGEsIHNsb3dRdWVyaWVzRGF0YSB9ID0gcGFyc2VEYXRhQ29uZmlnKHJlc29sdmVkKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBzZXJ2ZXI6IHtcbiAgICAgICAgICAgIGhvc3Q6IHJlc29sdmVkLmhvc3QsXG4gICAgICAgICAgICBwb3J0OiBOdW1iZXIucGFyc2VJbnQocmVzb2x2ZWQucG9ydCksXG4gICAgICAgICAgICBrZWVwQWxpdmU6IE51bWJlci5wYXJzZUludChyZXNvbHZlZC5rZWVwQWxpdmUpLFxuICAgICAgICB9LFxuICAgICAgICByZXF1ZXN0czoge1xuICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWQucmVxdWVzdHNNb2RlLFxuICAgICAgICAgICAgc2VydmVyOiByZXNvbHZlZC5yZXF1ZXN0c1NlcnZlcixcbiAgICAgICAgICAgIHRvcGljOiByZXNvbHZlZC5yZXF1ZXN0c1RvcGljLFxuICAgICAgICB9LFxuICAgICAgICBkYXRhLFxuICAgICAgICBzbG93UXVlcmllc0RhdGEsXG4gICAgICAgIGF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZC5hdXRoRW5kcG9pbnQsXG4gICAgICAgIH0sXG4gICAgICAgIG1hbUFjY2Vzc0tleXM6IG5ldyBTZXQoKHJlc29sdmVkLm1hbUFjY2Vzc0tleXMgfHwgJycpLnNwbGl0KCcsJykpLFxuICAgICAgICBqYWVnZXI6IHtcbiAgICAgICAgICAgIGVuZHBvaW50OiByZXNvbHZlZC5qYWVnZXJFbmRwb2ludCxcbiAgICAgICAgICAgIHNlcnZpY2U6IHJlc29sdmVkLnRyYWNlU2VydmljZSxcbiAgICAgICAgICAgIHRhZ3M6IHBhcnNlVGFncyhyZXNvbHZlZC50cmFjZVRhZ3MpLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0c2Q6IHtcbiAgICAgICAgICAgIHNlcnZlcjogcmVzb2x2ZWQuc3RhdHNkU2VydmVyLFxuICAgICAgICAgICAgdGFnczogKHJlc29sdmVkLnN0YXRzZFRhZ3MgfHwgJycpLnNwbGl0KCcsJykubWFwKHggPT4geC50cmltKCkpLmZpbHRlcih4ID0+IHgpLFxuICAgICAgICB9LFxuICAgIH07XG59XG5cbi8vIEludGVybmFsc1xuXG5mdW5jdGlvbiBnZXRJcCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IGlwdjQgPSAoT2JqZWN0LnZhbHVlcyhvcy5uZXR3b3JrSW50ZXJmYWNlcygpKTogYW55KVxuICAgICAgICAucmVkdWNlKChhY2MsIHgpID0+IGFjYy5jb25jYXQoeCksIFtdKVxuICAgICAgICAuZmluZCh4ID0+IHguZmFtaWx5ID09PSAnSVB2NCcgJiYgIXguaW50ZXJuYWwpO1xuICAgIHJldHVybiBpcHY0ICYmIGlwdjQuYWRkcmVzcztcbn1cblxuXG5mdW5jdGlvbiBwYXJzZVRhZ3Moczogc3RyaW5nKTogeyBbc3RyaW5nXTogc3RyaW5nIH0ge1xuICAgIGNvbnN0IHRhZ3M6IHsgW3N0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgcy5zcGxpdCgnLCcpLmZvckVhY2goKHQpID0+IHtcbiAgICAgICAgY29uc3QgaSA9IHQuaW5kZXhPZignPScpO1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICB0YWdzW3Quc3Vic3RyKDAsIGkpXSA9IHQuc3Vic3RyKGkgKyAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRhZ3NbdF0gPSAnJztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiB0YWdzO1xuXG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRGF0YUNvbmZpZyh2YWx1ZXM6IGFueSk6IHtcbiAgICBkYXRhOiBRRGF0YVByb3ZpZGVyc0NvbmZpZyxcbiAgICBzbG93UXVlcmllc0RhdGE6IFFEYXRhUHJvdmlkZXJzQ29uZmlnLFxufSB7XG4gICAgZnVuY3Rpb24gcGFyc2UocHJlZml4OiBzdHJpbmcsIGRlZk1heFNvY2tldHM6IG51bWJlcik6IFFEYXRhUHJvdmlkZXJzQ29uZmlnIHtcbiAgICAgICAgY29uc3Qgb3B0ID0gc3VmZml4ID0+IHZhbHVlc1tgJHtwcmVmaXh9JHtzdWZmaXh9YF0gfHwgJyc7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtdXQ6IHBhcnNlQXJhbmdvQ29uZmlnKG9wdCgnTXV0JyksIGRlZk1heFNvY2tldHMpLFxuICAgICAgICAgICAgaG90OiBwYXJzZUFyYW5nb0NvbmZpZyhvcHQoJ0hvdCcpLCBkZWZNYXhTb2NrZXRzKSxcbiAgICAgICAgICAgIGNvbGQ6IG9wdCgnQ29sZCcpLnNwbGl0KCcsJykuZmlsdGVyKHggPT4geCkubWFwKHggPT4gcGFyc2VBcmFuZ29Db25maWcoeCwgZGVmTWF4U29ja2V0cykpLFxuICAgICAgICAgICAgY2FjaGU6IHBhcnNlTWVtQ2FjaGVkQ29uZmlnKG9wdCgnQ2FjaGUnKSksXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBkYXRhOiBwYXJzZSgnZGF0YScsIERFRkFVTFRfQVJBTkdPX01BWF9TT0NLRVRTKSxcbiAgICAgICAgc2xvd1F1ZXJpZXNEYXRhOiBwYXJzZSgnc2xvd1F1ZXJpZXMnLCBERUZBVUxUX1NMT1dfUVVFUklFU19BUkFOR09fTUFYX1NPQ0tFVFMpLFxuICAgIH07XG59XG4iXX0=