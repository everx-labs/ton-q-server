"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _arangochair = _interopRequireDefault(require("arangochair"));

var _arangojs = require("arangojs");

var _arangoCollection = require("./arango-collection");

var _auth = require("./auth");

var _config = require("./config");

var _logs = _interopRequireDefault(require("./logs"));

var _resolversGenerated = require("./resolvers-generated");

var _opentracing = require("opentracing");

var _utils = require("./utils");

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
class Arango {
  constructor(config, logs, auth, tracer) {
    this.config = config;
    this.log = logs.create('db');
    this.auth = auth;
    this.serverAddress = config.database.server;
    this.databaseName = config.database.name;
    this.tracer = tracer;

    const createDb = config => {
      const db = new _arangojs.Database({
        url: `${(0, _config.ensureProtocol)(config.server, 'http')}`,
        agentOptions: {
          maxSockets: config.maxSockets
        }
      });
      db.useDatabase(config.name);

      if (config.auth) {
        const authParts = config.auth.split(':');
        db.useBasicAuth(authParts[0], authParts.slice(1).join(':'));
      }

      return db;
    };

    this.db = createDb(config.database);
    const slowDb = createDb(config.slowDatabase);
    this.collections = [];
    this.collectionsByName = new Map();

    const addCollection = (name, docType) => {
      const collection = new _arangoCollection.Collection(name, docType, logs, this.auth, this.tracer, this.db, slowDb);
      this.collections.push(collection);
      this.collectionsByName.set(name, collection);
      return collection;
    };

    this.transactions = addCollection('transactions', _resolversGenerated.Transaction);
    this.messages = addCollection('messages', _resolversGenerated.Message);
    this.accounts = addCollection('accounts', _resolversGenerated.Account);
    this.blocks = addCollection('blocks', _resolversGenerated.Block);
    this.blocks_signatures = addCollection('blocks_signatures', _resolversGenerated.BlockSignatures);
  }

  start() {
    const listenerUrl = `${(0, _config.ensureProtocol)(this.serverAddress, 'http')}/${this.databaseName}`;
    this.listener = new _arangochair.default(listenerUrl);

    if (this.config.database.auth) {
      const userPassword = Buffer.from(this.config.database.auth).toString('base64');
      this.listener.req.opts.headers['Authorization'] = `Basic ${userPassword}`;
    }

    this.collections.forEach(collection => {
      const name = collection.name;
      this.listener.subscribe({
        collection: name
      });
      this.listener.on(name, (docJson, type) => {
        if (type === 'insert/update') {
          this.onDocumentInsertOrUpdate(name, JSON.parse(docJson));
        }
      });
    });
    this.listener.start();
    this.log.debug('LISTEN', listenerUrl);
    this.listener.on('error', err => {
      this.log.error('FAILED', 'LISTEN', `${err}`);
      setTimeout(() => this.listener.start(), this.config.listener.restartTimeout);
    });
  }

  onDocumentInsertOrUpdate(name, doc) {
    const collection = this.collectionsByName.get(name);

    if (collection) {
      collection.onDocumentInsertOrUpdate(doc);
    }
  }

  async query(query, bindVars) {
    return (0, _utils.wrap)(this.log, 'QUERY', {
      query,
      bindVars
    }, async () => {
      const cursor = await this.db.query({
        query,
        bindVars
      });
      return cursor.all();
    });
  }

}

exports.default = Arango;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9hcmFuZ28uanMiXSwibmFtZXMiOlsiQXJhbmdvIiwiY29uc3RydWN0b3IiLCJjb25maWciLCJsb2dzIiwiYXV0aCIsInRyYWNlciIsImxvZyIsImNyZWF0ZSIsInNlcnZlckFkZHJlc3MiLCJkYXRhYmFzZSIsInNlcnZlciIsImRhdGFiYXNlTmFtZSIsIm5hbWUiLCJjcmVhdGVEYiIsImRiIiwiRGF0YWJhc2UiLCJ1cmwiLCJhZ2VudE9wdGlvbnMiLCJtYXhTb2NrZXRzIiwidXNlRGF0YWJhc2UiLCJhdXRoUGFydHMiLCJzcGxpdCIsInVzZUJhc2ljQXV0aCIsInNsaWNlIiwiam9pbiIsInNsb3dEYiIsInNsb3dEYXRhYmFzZSIsImNvbGxlY3Rpb25zIiwiY29sbGVjdGlvbnNCeU5hbWUiLCJNYXAiLCJhZGRDb2xsZWN0aW9uIiwiZG9jVHlwZSIsImNvbGxlY3Rpb24iLCJDb2xsZWN0aW9uIiwicHVzaCIsInNldCIsInRyYW5zYWN0aW9ucyIsIlRyYW5zYWN0aW9uIiwibWVzc2FnZXMiLCJNZXNzYWdlIiwiYWNjb3VudHMiLCJBY2NvdW50IiwiYmxvY2tzIiwiQmxvY2siLCJibG9ja3Nfc2lnbmF0dXJlcyIsIkJsb2NrU2lnbmF0dXJlcyIsInN0YXJ0IiwibGlzdGVuZXJVcmwiLCJsaXN0ZW5lciIsImFyYW5nb2NoYWlyIiwidXNlclBhc3N3b3JkIiwiQnVmZmVyIiwiZnJvbSIsInRvU3RyaW5nIiwicmVxIiwib3B0cyIsImhlYWRlcnMiLCJmb3JFYWNoIiwic3Vic2NyaWJlIiwib24iLCJkb2NKc29uIiwidHlwZSIsIm9uRG9jdW1lbnRJbnNlcnRPclVwZGF0ZSIsIkpTT04iLCJwYXJzZSIsImRlYnVnIiwiZXJyIiwiZXJyb3IiLCJzZXRUaW1lb3V0IiwicmVzdGFydFRpbWVvdXQiLCJkb2MiLCJnZXQiLCJxdWVyeSIsImJpbmRWYXJzIiwiY3Vyc29yIiwiYWxsIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBa0JBOztBQUNBOztBQUNB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RUQsR0FBSSxFQUExQztBQUNBRSxNQUFBQSxVQUFVLENBQUMsTUFBTSxLQUFLcEIsUUFBTCxDQUFjRixLQUFkLEVBQVAsRUFBOEIsS0FBSzVDLE1BQUwsQ0FBWThDLFFBQVosQ0FBcUJxQixjQUFuRCxDQUFWO0FBQ0gsS0FIRDtBQUlIOztBQUVEUCxFQUFBQSx3QkFBd0IsQ0FBQ2xELElBQUQsRUFBZTBELEdBQWYsRUFBeUI7QUFDN0MsVUFBTXRDLFVBQTJDLEdBQUcsS0FBS0osaUJBQUwsQ0FBdUIyQyxHQUF2QixDQUEyQjNELElBQTNCLENBQXBEOztBQUNBLFFBQUlvQixVQUFKLEVBQWdCO0FBQ1pBLE1BQUFBLFVBQVUsQ0FBQzhCLHdCQUFYLENBQW9DUSxHQUFwQztBQUNIO0FBQ0o7O0FBR0QsUUFBTUUsS0FBTixDQUFZQSxLQUFaLEVBQXdCQyxRQUF4QixFQUF1QztBQUNuQyxXQUFPLGlCQUFLLEtBQUtuRSxHQUFWLEVBQWUsT0FBZixFQUF3QjtBQUFFa0UsTUFBQUEsS0FBRjtBQUFTQyxNQUFBQTtBQUFULEtBQXhCLEVBQTZDLFlBQVk7QUFDNUQsWUFBTUMsTUFBTSxHQUFHLE1BQU0sS0FBSzVELEVBQUwsQ0FBUTBELEtBQVIsQ0FBYztBQUFFQSxRQUFBQSxLQUFGO0FBQVNDLFFBQUFBO0FBQVQsT0FBZCxDQUFyQjtBQUNBLGFBQU9DLE1BQU0sQ0FBQ0MsR0FBUCxFQUFQO0FBQ0gsS0FITSxDQUFQO0FBSUg7O0FBckh1QiIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgMjAxOC0yMDIwIFRPTiBERVYgU09MVVRJT05TIExURC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgU09GVFdBUkUgRVZBTFVBVElPTiBMaWNlbnNlICh0aGUgXCJMaWNlbnNlXCIpOyB5b3UgbWF5IG5vdCB1c2VcbiAqIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZVxuICogTGljZW5zZSBhdDpcbiAqXG4gKiBodHRwOi8vd3d3LnRvbi5kZXYvbGljZW5zZXNcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIFRPTiBERVYgc29mdHdhcmUgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuLy8gQGZsb3dcblxuaW1wb3J0IGFyYW5nb2NoYWlyIGZyb20gJ2FyYW5nb2NoYWlyJztcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnYXJhbmdvanMnO1xuaW1wb3J0IHsgQ29sbGVjdGlvbn0gZnJvbSBcIi4vYXJhbmdvLWNvbGxlY3Rpb25cIjtcbmltcG9ydCB7IEF1dGggfSBmcm9tIFwiLi9hdXRoXCI7XG5pbXBvcnQgdHlwZSB7IFFDb25maWcsIFFEYkNvbmZpZyB9IGZyb20gJy4vY29uZmlnJ1xuaW1wb3J0IHsgZW5zdXJlUHJvdG9jb2wgfSBmcm9tICcuL2NvbmZpZyc7XG5pbXBvcnQgdHlwZSB7IFFMb2cgfSBmcm9tICcuL2xvZ3MnO1xuaW1wb3J0IFFMb2dzIGZyb20gJy4vbG9ncydcbmltcG9ydCB0eXBlIHsgUVR5cGUgfSBmcm9tICcuL2RiLXR5cGVzJztcbmltcG9ydCB7IEFjY291bnQsIEJsb2NrLCBCbG9ja1NpZ25hdHVyZXMsIE1lc3NhZ2UsIFRyYW5zYWN0aW9uIH0gZnJvbSAnLi9yZXNvbHZlcnMtZ2VuZXJhdGVkJztcbmltcG9ydCB7IFRyYWNlciB9IGZyb20gXCJvcGVudHJhY2luZ1wiO1xuaW1wb3J0IHsgd3JhcCB9IGZyb20gXCIuL3V0aWxzXCI7XG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQXJhbmdvIHtcbiAgICBjb25maWc6IFFDb25maWc7XG4gICAgbG9nOiBRTG9nO1xuICAgIHNlcnZlckFkZHJlc3M6IHN0cmluZztcbiAgICBkYXRhYmFzZU5hbWU6IHN0cmluZztcbiAgICBkYjogRGF0YWJhc2U7XG4gICAgc2xvd0RiOiBEYXRhYmFzZTtcblxuICAgIGF1dGg6IEF1dGg7XG4gICAgdHJhY2VyOiBUcmFjZXI7XG5cbiAgICB0cmFuc2FjdGlvbnM6IENvbGxlY3Rpb247XG4gICAgbWVzc2FnZXM6IENvbGxlY3Rpb247XG4gICAgYWNjb3VudHM6IENvbGxlY3Rpb247XG4gICAgYmxvY2tzOiBDb2xsZWN0aW9uO1xuICAgIGJsb2Nrc19zaWduYXR1cmVzOiBDb2xsZWN0aW9uO1xuXG4gICAgY29sbGVjdGlvbnM6IENvbGxlY3Rpb25bXTtcbiAgICBjb2xsZWN0aW9uc0J5TmFtZTogTWFwPHN0cmluZywgQ29sbGVjdGlvbj47XG5cbiAgICBsaXN0ZW5lcjogYW55O1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIGNvbmZpZzogUUNvbmZpZyxcbiAgICAgICAgbG9nczogUUxvZ3MsXG4gICAgICAgIGF1dGg6IEF1dGgsXG4gICAgICAgIHRyYWNlcjogVHJhY2VyLFxuICAgICkge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5sb2cgPSBsb2dzLmNyZWF0ZSgnZGInKTtcbiAgICAgICAgdGhpcy5hdXRoID0gYXV0aDtcbiAgICAgICAgdGhpcy5zZXJ2ZXJBZGRyZXNzID0gY29uZmlnLmRhdGFiYXNlLnNlcnZlcjtcbiAgICAgICAgdGhpcy5kYXRhYmFzZU5hbWUgPSBjb25maWcuZGF0YWJhc2UubmFtZTtcbiAgICAgICAgdGhpcy50cmFjZXIgPSB0cmFjZXI7XG5cbiAgICAgICAgY29uc3QgY3JlYXRlRGIgPSAoY29uZmlnOiBRRGJDb25maWcpOiBEYXRhYmFzZSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkYiA9IG5ldyBEYXRhYmFzZSh7XG4gICAgICAgICAgICAgICAgdXJsOiBgJHtlbnN1cmVQcm90b2NvbChjb25maWcuc2VydmVyLCAnaHR0cCcpfWAsXG4gICAgICAgICAgICAgICAgYWdlbnRPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgIG1heFNvY2tldHM6IGNvbmZpZy5tYXhTb2NrZXRzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGRiLnVzZURhdGFiYXNlKGNvbmZpZy5uYW1lKTtcbiAgICAgICAgICAgIGlmIChjb25maWcuYXV0aCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGF1dGhQYXJ0cyA9IGNvbmZpZy5hdXRoLnNwbGl0KCc6Jyk7XG4gICAgICAgICAgICAgICAgZGIudXNlQmFzaWNBdXRoKGF1dGhQYXJ0c1swXSwgYXV0aFBhcnRzLnNsaWNlKDEpLmpvaW4oJzonKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kYiA9IGNyZWF0ZURiKGNvbmZpZy5kYXRhYmFzZSk7XG4gICAgICAgIGNvbnN0IHNsb3dEYiA9IGNyZWF0ZURiKGNvbmZpZy5zbG93RGF0YWJhc2UpO1xuXG4gICAgICAgIHRoaXMuY29sbGVjdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5jb2xsZWN0aW9uc0J5TmFtZSA9IG5ldyBNYXAoKTtcblxuICAgICAgICBjb25zdCBhZGRDb2xsZWN0aW9uID0gKG5hbWU6IHN0cmluZywgZG9jVHlwZTogUVR5cGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgQ29sbGVjdGlvbihcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIGRvY1R5cGUsXG4gICAgICAgICAgICAgICAgbG9ncyxcbiAgICAgICAgICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgICAgICAgICAgdGhpcy50cmFjZXIsXG4gICAgICAgICAgICAgICAgdGhpcy5kYixcbiAgICAgICAgICAgICAgICBzbG93RGIsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9ucy5wdXNoKGNvbGxlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uc0J5TmFtZS5zZXQobmFtZSwgY29sbGVjdGlvbik7XG4gICAgICAgICAgICByZXR1cm4gY29sbGVjdGlvbjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnRyYW5zYWN0aW9ucyA9IGFkZENvbGxlY3Rpb24oJ3RyYW5zYWN0aW9ucycsIFRyYW5zYWN0aW9uKTtcbiAgICAgICAgdGhpcy5tZXNzYWdlcyA9IGFkZENvbGxlY3Rpb24oJ21lc3NhZ2VzJywgTWVzc2FnZSk7XG4gICAgICAgIHRoaXMuYWNjb3VudHMgPSBhZGRDb2xsZWN0aW9uKCdhY2NvdW50cycsIEFjY291bnQpO1xuICAgICAgICB0aGlzLmJsb2NrcyA9IGFkZENvbGxlY3Rpb24oJ2Jsb2NrcycsIEJsb2NrKTtcbiAgICAgICAgdGhpcy5ibG9ja3Nfc2lnbmF0dXJlcyA9IGFkZENvbGxlY3Rpb24oJ2Jsb2Nrc19zaWduYXR1cmVzJywgQmxvY2tTaWduYXR1cmVzKTtcbiAgICB9XG5cbiAgICBzdGFydCgpIHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXJVcmwgPSBgJHtlbnN1cmVQcm90b2NvbCh0aGlzLnNlcnZlckFkZHJlc3MsICdodHRwJyl9LyR7dGhpcy5kYXRhYmFzZU5hbWV9YDtcbiAgICAgICAgdGhpcy5saXN0ZW5lciA9IG5ldyBhcmFuZ29jaGFpcihsaXN0ZW5lclVybCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmRhdGFiYXNlLmF1dGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHVzZXJQYXNzd29yZCA9IEJ1ZmZlci5mcm9tKHRoaXMuY29uZmlnLmRhdGFiYXNlLmF1dGgpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXIucmVxLm9wdHMuaGVhZGVyc1snQXV0aG9yaXphdGlvbiddID0gYEJhc2ljICR7dXNlclBhc3N3b3JkfWA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvbGxlY3Rpb25zLmZvckVhY2goY29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gY29sbGVjdGlvbi5uYW1lO1xuICAgICAgICAgICAgdGhpcy5saXN0ZW5lci5zdWJzY3JpYmUoeyBjb2xsZWN0aW9uOiBuYW1lIH0pO1xuICAgICAgICAgICAgdGhpcy5saXN0ZW5lci5vbihuYW1lLCAoZG9jSnNvbiwgdHlwZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlID09PSAnaW5zZXJ0L3VwZGF0ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbkRvY3VtZW50SW5zZXJ0T3JVcGRhdGUobmFtZSwgSlNPTi5wYXJzZShkb2NKc29uKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmxpc3RlbmVyLnN0YXJ0KCk7XG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCdMSVNURU4nLCBsaXN0ZW5lclVybCk7XG4gICAgICAgIHRoaXMubGlzdGVuZXIub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ0ZBSUxFRCcsICdMSVNURU4nLCBgJHtlcnJ9YCk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMubGlzdGVuZXIuc3RhcnQoKSwgdGhpcy5jb25maWcubGlzdGVuZXIucmVzdGFydFRpbWVvdXQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkRvY3VtZW50SW5zZXJ0T3JVcGRhdGUobmFtZTogc3RyaW5nLCBkb2M6IGFueSkge1xuICAgICAgICBjb25zdCBjb2xsZWN0aW9uOiAoQ29sbGVjdGlvbiB8IHR5cGVvZiB1bmRlZmluZWQpID0gdGhpcy5jb2xsZWN0aW9uc0J5TmFtZS5nZXQobmFtZSk7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICBjb2xsZWN0aW9uLm9uRG9jdW1lbnRJbnNlcnRPclVwZGF0ZShkb2MpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBhc3luYyBxdWVyeShxdWVyeTogYW55LCBiaW5kVmFyczogYW55KSB7XG4gICAgICAgIHJldHVybiB3cmFwKHRoaXMubG9nLCAnUVVFUlknLCB7IHF1ZXJ5LCBiaW5kVmFycyB9LCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXJzb3IgPSBhd2FpdCB0aGlzLmRiLnF1ZXJ5KHsgcXVlcnksIGJpbmRWYXJzIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGN1cnNvci5hbGwoKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19