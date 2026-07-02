/**
 * Qiniu storage module for Ghost blog 1.x
 * @see https://docs.ghost.org/v1.0.0/docs/using-a-custom-storage-module
 */

'use strict';

const path = require('path');
const fs = require('fs');
const urlParse = require('url').parse;
const Promise = require('bluebird');
const moment = require('moment');
const qn = require('qn');
const StorageBase = require('ghost-storage-base');
const errors = require('@tryghost/errors');
const security = require('@tryghost/security');

const getHash = require('./lib/getHash');
const logPrefix = '[QiniuStore]';

class QiniuStore extends StorageBase {
  constructor(options) {
    super(options);

    this.options = options || {};
    this.client = qn.create(this.options);
  }

  save(file, targetDir) {
    const client = this.client;
    const _this = this;

    return new Promise(function(resolve, reject) {
      _this.getFileKey(file).then((function(key) {
        client.upload(fs.createReadStream(file.path), {
          key: key
        }, function(err, result) {
          err ? reject(err) : resolve(result.url);
        });
      }));
    });
  }

  saveRaw(buffer, targetPath) {
    const client = this.client;
    const origin = (this.options.origin || '').replace(/\/$/, '');
    let key = targetPath.replace(/\\/g, '/');

    const keyOptions = this.options.fileKey;
    if (keyOptions && keyOptions.prefix) {
      const getValue = function(obj) {
        return typeof obj === 'function' ? obj() : obj;
      };
      const prefix = moment().format(getValue(keyOptions.prefix))
        .replace(/^\//, '');
      key = prefix + key;
    }

    return new Promise(function(resolve, reject) {
      client.upload(buffer, { key: key }, function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result.url || (origin + '/' + key));
      });
    });
  }

  urlToPath(url) {
    const origin = (this.options.origin || '').replace(/\/$/, '');
    if (url.startsWith(origin + '/')) {
      return url.slice(origin.length + 1);
    }
    return urlParse(url).pathname.slice(1);
  }

  exists(filename, targetDir) {
    return new Promise(function(resolve, reject) {
      resolve(false);
    });
  }

  serve() {
    return function(req, res, next) {
      next();
    };
  }

  delete(fileName, targetDir) {
    return new Promise(function(resolve, reject) {
      resolve(true);
    });
  }

  read(options) {
    options = options || {};

    const client = this.client;
    const key = urlParse(options.path).pathname.slice(1);

    return new Promise(function(resolve, reject) {
      client.download(key, function(err, content, res) {
        if (err) {
          return reject(new errors.GhostError({
            err: err,
            message: `${logPrefix} Could not read image: ${options.path}`,
          }));
        }

        resolve(content);
      });
    });
  }

  getFileKey(file) {
    const keyOptions = this.options.fileKey;
    let fileKey = null;

    if (keyOptions) {
      const getValue = function(obj) {
        return typeof obj === 'function' ? obj() : obj;
      };
      const ext = path.extname(file.name);
      let basename = path.basename(file.name, ext);
      let prefix = '';
      let suffix = '';
      let extname = '';

      if (keyOptions.prefix) {
        prefix = moment().format(getValue(keyOptions.prefix))
          .replace(/^\//, '');
      }

      if (keyOptions.suffix) {
        suffix = getValue(keyOptions.suffix);
      }

      if (keyOptions.extname !== false) {
        extname = ext.toLowerCase();
      }

      const contactKey = function(name) {
        return prefix + name + suffix + extname;
      };

      if (keyOptions.hashAsBasename) {
        return getHash(file).then(function(hash) {
          return contactKey(hash);
        });
      } else if (keyOptions.safeString) {
        basename = security.string.safe(basename);
      }

      fileKey = contactKey(basename);
    }

    return Promise.resolve(fileKey);
  }
}

module.exports = QiniuStore;
