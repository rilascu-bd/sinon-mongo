const Stream = require('stream');
const mongodb = require('mongodb');
const { MongoClient, Db, Collection } = mongodb;

const install = sinon => {

  sinon.mongo = sinon.mongo || {};

  // Compatibility shim for MongoDB v6: allow calling ObjectId() without `new`
  // Tests in this repo use `mongodb.ObjectId()`; in v6 it requires `new`.
  // Monkey-patch the exported ObjectId to be callable and construct correctly.
  try {
    const OriginalObjectId = mongodb.ObjectId;
    if (typeof OriginalObjectId === 'function' && !OriginalObjectId.__sinonMongoPatched) {
      function CallableObjectId(...args) {
        return new OriginalObjectId(...args);
      }
      // Preserve prototype and static props
      Object.setPrototypeOf(CallableObjectId, OriginalObjectId);
      CallableObjectId.prototype = OriginalObjectId.prototype;
      Object.getOwnPropertyNames(OriginalObjectId).forEach(name => {
        if (!(name in CallableObjectId)) {
          try { CallableObjectId[name] = OriginalObjectId[name]; } catch (_) {}
        }
      });
      CallableObjectId.__sinonMongoPatched = true;

      // Override export even if non-writable using defineProperty
      try {
        Object.defineProperty(mongodb, 'ObjectId', {
          value: CallableObjectId,
          configurable: true,
          enumerable: true,
          writable: true
        });
      } catch (_) {
        // Fallback: update module cache exports
        try {
          const modPath = require.resolve('mongodb');
          const cached = require.cache[modPath];
          if (cached && cached.exports) {
            cached.exports.ObjectId = CallableObjectId;
          }
        } catch (__) {}
      }
    }
  } catch (_) {}

  // Helpers to create stubs of MongoClient, Db and Collection
  sinon.mongo.mongoClient = (databases, methodStubs) => {
    const dbGetterStub = sinon.stub();
    dbGetterStub.returns(sinon.mongo.db());
    if (databases){
      Object.getOwnPropertyNames(databases)
        .forEach(dbName => dbGetterStub.withArgs(dbName).returns(databases[dbName]))
    }

    const stubMongoClient = sinon.createStubInstance(
      MongoClient,
      Object.assign({
        db: dbGetterStub
      }, methodStubs)
    );
    stubMongoClient.connect = sinon.stub().resolves(stubMongoClient);
    return stubMongoClient;
  };

  sinon.mongo.db = (collections, methodStubs) => {
    const collectionGetterStub = sinon.stub();
    collectionGetterStub.returns(sinon.mongo.collection());
    if (collections){
      Object.getOwnPropertyNames(collections)
        .forEach(collName => collectionGetterStub.withArgs(collName).returns(collections[collName]))
    }
    return sinon.createStubInstance(
      Db,
      Object.assign({
        collection: collectionGetterStub
      }, methodStubs)
    );
  };

  sinon.mongo.collection = methodStubs => sinon.createStubInstance(
    Collection,
    methodStubs
  );

  // Helpers to create array/stream results for collection operations
  sinon.mongo.documentArray = result => {
    if (!result) result = [];
    if (result.constructor !== Array) result = [result];

    // Emulate a FindCursor-like object with chainable ops and toArray
    const cursor = {
      limit: sinon.stub().returnsThis(),
      skip: sinon.stub().returnsThis(),
      sort: sinon.stub().returnsThis(),
      toArray: () => Promise.resolve(result),
      forEach: fn => { result.forEach(fn); return Promise.resolve(); },
      [Symbol.asyncIterator]: async function* () { for (const item of result) { yield item; } }
    };

    return cursor;
  };

  sinon.mongo.documentStream = result => {
    if (!result) result = [];
    if (result.constructor !== Array) result = [result];

    const readableStream = new Stream.Readable({ objectMode: true });
    result.forEach(item => readableStream.push(item));
    readableStream.push(null);

    // Legacy behavior: return the readable stream directly, and also
    // provide a .stream() method for explicit access.
    readableStream.stream = () => readableStream;
    return readableStream;
  };
};


module.exports = {
  install,
};