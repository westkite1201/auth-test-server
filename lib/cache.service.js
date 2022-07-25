const NodeCache = require('node-cache');

class Cache {
  constructor(ttlSeconds) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      //useClones: false,
    });
  }

  get(key, isUsingDatabase, storeFunction, apiFucntion) {
    const value = this.cache.get(key);
    if (value) {
      console.log('cache hit!');
      return Promise.resolve(value);
    }

    if (isUsingDatabase) {
      console.log('is Using data base');
      //use Db
      return storeFunction().then((result) => {
        this.cache.set(key, result);
        return result;
      });
    } else {
      //use api
      console.log('is using api');
      return apiFucntion().then((result) => {
        if (result.status === 200 && result.message === 'success') {
          //this.cache.set(key, Object.assign({}, result));
          this.cache.set(key, result);
        }
        return result;
      });
    }
  }

  del(keys) {
    this.cache.del(keys);
  }

  delStartWith(startStr = '') {
    if (!startStr) {
      return;
    }

    const keys = this.cache.keys();
    for (const key of keys) {
      if (key.indexOf(startStr) === 0) {
        this.del(key);
      }
    }
  }

  flush() {
    this.cache.flushAll();
  }
}

module.exports = {
  CacheService: Cache,
};
