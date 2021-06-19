/////////////////////////////
///////    HELPERS    ///////
/////////////////////////////

var Promise = require('promise');
var axios = require('axios');
const axiosRetry = require('axios-retry');
var parser = require('./xmlParser.js');
var parser2 = require('xml-js');
var fs = require('fs');
var utf8 = require('utf8');
var fileInfo = require('./fileInfo.js');
var FormData = require('form-data');

if (process.env.NODE_ENV !== 'production') require('axios-debug-log')({
    request: function (debug, config) {
      debug('Request with ', config.method, config.headers)
    },
    response: function (debug, response) {
      debug(
        'Response with ' + response.status,
        'from ' + response.config.url
      )
    },
    error: function (debug, error) {
      // Read https://www.npmjs.com/package/axios#handling-errors for more info
      debug('Boom', error)
    }
  })

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });


/**
 * @class helpers
 * @classdesc
 * <b><i>This is a class for helper functions, dont mess with this until sure!</i></b><br><br>
 *
 * @author Noveen Sachdeva
 * @version 1.0.0
 */
function helpers() {
    this.OCS_BASEPATH = 'ocs/v1.php/';
    this.OCS_SERVICE_SHARE = 'apps/files_sharing/api/v1';
    this.OCS_SERVICE_PRIVATEDATA = 'privatedata';
    this.OCS_SERVICE_CLOUD = 'cloud';

    // constants from lib/public/constants.php
    this.OCS_PERMISSION_READ = 1;
    this.OCS_PERMISSION_UPDATE = 2;
    this.OCS_PERMISSION_CREATE = 4;
    this.OCS_PERMISSION_DELETE = 8;
    this.OCS_PERMISSION_SHARE = 16;
    this.OCS_PERMISSION_ALL = 31;

    // constants from lib/public/share.php
    this.OCS_SHARE_TYPE_USER = 0;
    this.OCS_SHARE_TYPE_GROUP = 1;
    this.OCS_SHARE_TYPE_LINK = 3;
    this.OCS_SHARE_TYPE_REMOTE = 6;

    this.instance = null;
    this._authHeader = null;
    this._version = null;
    this._capabilities = null;
    this._currentUser = null;
}

/**
 * sets the OC instance
 * @param   {string}    instance    instance to be used for communication
 */
helpers.prototype.setInstance = function(instance) {
    this.instance = instance;
    this._webdavUrl = this.instance + 'remote.php/webdav';
};

/**
 * sets the username
 * @param   {string}    authHeader    authorization header; either basic or bearer or what ever
 */
helpers.prototype.setAuthorization = function(authHeader) {
    this._authHeader = authHeader;
};

/**
 * gets the OC version
 * @returns {string}    OC version
 */
helpers.prototype.getVersion = function() {
    return this._version;
};

/**
 * Gets all capabilities of the logged in user
 * @returns {object}    all capabilities
 */
helpers.prototype.getCapabilities = function() {
    return this._capabilities;
};

/**
 * Gets the logged in user
 * @returns {object}    user info
 */
helpers.prototype.getCurrentUser= function() {
    return this._currentUser;
};

/**
 * Updates the capabilities of user logging in.
 * @returns {Promise.<capabilities>}    object: all capabilities
 * @returns {Promise.<error>}           string: error message, if any.
 */
helpers.prototype._updateCapabilities = function() {
    var self = this;
    return new Promise((resolve, reject) => {
        self._makeOCSrequest('GET', self.OCS_SERVICE_CLOUD, "capabilities")
            .then(data => {
                var body = data.data.ocs.data;

                self._capabilities = body.capabilities;
                self._version = body.version.string + '-' + body.version.edition;

                resolve(self._capabilities);
            }).catch(error => {
            reject(error);
        });
    });
};

/**
 * Updates the user logging in.
 * @returns {Promise.<_currentUser>}    object: _currentUser
 * @returns {Promise.<error>}           string: error message, if any.
 */
helpers.prototype._updateCurrentUser = function() {
    var self = this;
    return new Promise((resolve, reject) => {
        self._makeOCSrequest('GET', self.OCS_SERVICE_CLOUD, "user")
            .then(data => {
                var body = data.data.ocs.data;

                self._currentUser = body;

                resolve(self._currentUser);
            }).catch(error => {
            reject(error);
        });
    });
};

/**
 * Makes an OCS API request.
 * @param   {string} method     method of request (GET, POST etc.)
 * @param   {string} service    service (cloud, privatedata etc.)
 * @param   {string} action     action (apps?filter=enabled, capabilities etc.)
 * @param   {string} [data]     formData for POST and PUT requests
 * @returns {Promise.<data>}    object: {response: response, body: request body}
 * @returns {Promise.<error>}   string: error message, if any.
 */
helpers.prototype._makeOCSrequest = function(method, service, action, data) {
    var self = this;
    var err = null;

    if (!this.instance) {
        err = "Please specify a server URL first";
    }

    if (!this._authHeader) {
        err = "Please specify an authorization first.";
    }

    if (err) return Promise.reject(err)

    // Set the headers
    var headers = {
        authorization: this._authHeader,
        'OCS-APIREQUEST': true
    };

    var slash = '';

    if (service) {
        slash = '/';
    }

    var path = this.OCS_BASEPATH + service + slash + action;

    //Configure the request
    var options = {
        url: this.instance + path,
        method: method,
        headers: headers,
    };

    if (method === 'PUT' || method === 'DELETE') {
        if (data) {
            let params = new URLSearchParams()
            Object.entries(data).map(kv => params.append(kv[0], kv[1]))
            options.params = params
        }
        options.headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (method === 'POST') {
        if (data) {
            let form = new FormData()
            Object.entries(data).map(kv => {
                field = kv[0],
                value = kv[1]
                form.append(field, value)
            })
            options.data = form
            options.headers = { ...form.getHeaders(), ...options.headers }
        }
    }

	return new Promise((resolve, reject) => {
		// Start the request
		axios(options).then(response => {
            const body = response.data
			try {
    			var tree = parser.xml2js(body);
				error = self._checkOCSstatus(tree);
				if (error) {
					reject(error);
					return;
				}
			} catch (e) {
				try {
					var tree = JSON.parse(body);
					if ("message" in tree) {
						reject(tree.message);
						return;
					}
					error = self._checkOCSstatus(tree);
					if (error) {
						reject(error);
						return;
					}
				} catch (e) {
					reject('Invalid response body: ' + body);
					return;
				}
			}
			resolve({
				response: response,
				body: body,
                data: tree
			});
		})
        .catch(error => {
            reject(error);
            return;
        })
    });
};

/**
 * Makes a DAV request.
 * @param   {string} method          method of request (PROPFIND, MKCOL etc.)
 * @param   {string} path            path of file/folder
 * @param   {object} [headerData]    headerData to be set before the request
 * @param   {object} [body]          body of request
 * @returns {Promise.<body>}         string: parsed response
 * @returns {Promise.<error>}        string: error message, if any.
 */
helpers.prototype._makeDAVrequest = function(method, path, headerData, body) {
    var self = this;
    var err = null;

    if (!this.instance) {
        err = "Please specify a server URL first";
    }

    if (!this._authHeader) {
        err = "Please specify an authorization first.";
    }

    if (err) return Promise.reject(err)

    path = self._normalizePath(path);
    path = encodeURIComponent(path);
    path = path.split('%2F').join('/'); // '/' => %2F
    var url = self._webdavUrl + self._encodeString(path);

    // Set the headers
    var headers = {
        authorization: this._authHeader
    };

    //Configure the request
    var options = {
        url: url,
        method: method,
        headers: headers
    };

    for (var key in headerData) {
        options.headers[key] = headerData[key];
    }

    options.data = body

    return new Promise((resolve, reject) => {
        // Start the request
        axios(options).then(response => {
            const body = response.data
            if ([200, 207].indexOf(response.status) > -1) {
                self._parseDAVresponse(resolve, reject, body);
            } else if ([201, 204].indexOf(response.status) > -1) {
                resolve(true);
            } else {
                var err = self._parseDAVerror(body);
                reject(err);
            }
        })
        .catch(error => {
            reject(error)
        })
    });
};

/**
 * Parses a DAV response.
 */
helpers.prototype._parseDAVresponse = function(resolve, reject, body) {
    var XMLns = this._getXMLns(body);

    var tree = parser.xml2js(body, XMLns)['{DAV:}multistatus']['{DAV:}response'];
    var items = [];

    if (tree.constructor !== Array) {
        tree = [tree];
    }

    for (var item = 0; item < tree.length; item++) {
        items.push(this._parseDAVelement(tree[item]));
    }

    resolve(items);
};

/**
 * Parses a DAV response element.
 */
helpers.prototype._parseDAVelement = function(item) {
    var name = item['{DAV:}href'];
    var attrs = item['{DAV:}propstat']['{DAV:}prop'];
    var fileType = name.substr(-1) === '/' ? 'dir' : 'file';

    var start = 0;
    name = name.split('/');
    for (var i = 0; i < name.length; i++) {
        if (name[i] === 'webdav') {
            start = i;
            break;
        }
    }
    name.splice(0, start + 1);
    name = '/' + name.join('/');

    name = decodeURIComponent(name);

    name = utf8.encode(name);
    name = utf8.decode(name);

    var file = new fileInfo(name, fileType, attrs);
    return file;
};

/**
 * performs a simple GET request
 * @param   {string}    url     url to perform GET on
 * @returns {Promise.<data>}    object: {response: response, body: request body}
 * @returns {Promise.<error>}   string: error message, if any.
 */
helpers.prototype._get = function(url) {
    var err = null;

    if (!this.instance) {
        err = "Please specify a server URL first";
    }

    if (!this._authHeader) {
        err = "Please specify an authorization first.";
    }

    if (err) return Promise.reject(err)

    var headers = {
        authorization: this._authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    //Configure the request
    var options = {
        url: url,
        method: 'GET',
        headers: headers
    };

    return new Promise((resolve, reject) => {
        // Start the request
        axios(options).then(response => {
            const body = response.data
            resolve({
                response: response,
                body: body
            });
        })
        .catch(error => { reject(error) })
    });
};

/**
 * performs a GET request and writes the output into a file
 * @param   {string}  url       url to perform GET on
 * @param   {string}  fileName  name of the file to write the response into
 * @returns {Promise.<data>}    object: {response: response, body: request body}
 * @returns {Promise.<error>}   string: error message, if any.
 */
helpers.prototype._writeData = function(url, fileName) {
    var self = this;
    var err = null;

    if (!this.instance) {
        err = "Please specify a server URL first";
    }

    if (!this._authHeader) {
        err = "Please specify an authorization first.";
    }

    if (err) return Promise.reject(err)

    var headers = {
        authorization: this._authHeader,
        'Content-Type': 'application/octet-stream'
    };

    //Configure the request
    var options = {
        url: url,
        method: 'GET',
        headers: headers
    };

    return new Promise((resolve, reject) => {
        var isPossible = 1;

        try {
            fs.closeSync(fs.openSync(fileName, 'w'));
        } catch (error) {
            isPossible = 0;
            reject(error.message);
            return;
        }

        // Start the request
        /* jshint unused : false */
        axios(options)
        .then(response => {
            const body = response.data
            if (response.status === 200 && isPossible === 1 && body.split('\n')[0] !== "<!DOCTYPE html>") {
                response.data.pipe(fs.createWriteStream(fileName));
                resolve(true);
            } else {
                try {
                    var err = self._parseDAVerror(body);
                    reject(err);
                } catch (error) {
                    if (body.search("<li class=\"error\">") > -1) {
                        reject('specified file/folder could not be located');
                    } else {
                        reject("Current user is not logged in");
                    }
                }
            }
        })
        .on('error', function(error) {
            if (error.request) {
                reject(error.request)
                return
            } else if (error.response) {
                reject(error.response)
                return
            }
        })
        /* jshint unused : true */
    });
};

/**
 * performs a PUT request from a file
 * @param   {string} path       path where to put at OC instance
 * @param   {string} localPath  path of the file to read the data from
 * @param   {object} headers    extra headers to add for the PUT request
 * @returns {Promise.<data>}    object: {response: response, body: request body}
 * @returns {Promise.<error>}   string: error message, if any.
 */
helpers.prototype._readFile = function(path, localPath, headers) {
    var self = this;

    return new Promise((resolve, reject) => {
        try {
            path = self._normalizePath(path);
            path = encodeURIComponent(path);
            path = path.split('%2F').join('/'); // '/' => %2F
            var url = self._webdavUrl + self._encodeString(path);
            /* jshint unused : false */
            fs.createReadStream(localPath)
                .pipe(axios.put({
                        url: url,
                        headers: headers
                    })
                    .then(response => {
                        if (response.status >= 400) {
                            var parsedError = self._parseDAVerror(body);
                            parsedError = parsedError || 'not allowed';
                            reject(parsedError);
                        } else {
                            resolve(true);
                        }
                    })
                )
            /* jshint unused : true */
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * checks whether a path's extension is ".ZIP"
 * @param   {string}    path    path to check
 * @return  {boolean}           true if extension is ".ZIP"
 */
helpers.prototype._checkExtensionZip = function(path) {
    var extension = path.slice(-4);
    if (extension !== '.zip') {
        path += '.zip';
    }
    return path;
};

/**
 * Parses a DAV response error.
 */
helpers.prototype._parseDAVerror = function(body) {
    var tree = parser.xml2js(body);

    if (tree['d:error']['s:message']) {
        return tree['d:error']['s:message'];
    }
    return tree;
};

/**
 * Makes sure path starts with a '/'
 * @param   {string}    path    to the remote file share
 * @returns {string}            normalized path
 */
helpers.prototype._normalizePath = function(path) {
    if (!path) {
        path = '';
    }

    if (path.length === 0) {
        return '/';
    }

    if (path[0] !== '/') {
        path = '/' + path;
    }

    return path;
};

/**
 * Checks the status code of an OCS request
 * @param   {object} json                         parsed response
 * @param   {array}  [acceptedCodes = [100] ]     array containing accepted codes
 * @returns {string}                              error message or NULL
 */
helpers.prototype._checkOCSstatus = function(json, acceptedCodes) {
    if (!acceptedCodes) {
        acceptedCodes = [100];
    }

    var meta;
    if (json.ocs) {
        meta = json.ocs.meta;
    }
    var ret;

    if (meta && acceptedCodes.indexOf(parseInt(meta.statuscode)) === -1) {
        ret = meta.message;

        if (Object.keys(meta.message).length === 0) {
            // no error message returned, return the whole message
            ret = json;
        }
    }

    return ret;
};

/**
 * Returns the status code of the xml response
 * @param   {object}    json    parsed response
 * @return  {integer}           status-code
 */
helpers.prototype._checkOCSstatusCode = function(json) {
    if (json.ocs) {
        var meta = json.ocs.meta;
        return parseInt(meta.statuscode);
    }
    return null;
};

/**
 * Encodes the string according to UTF-8 standards
 * @param   {string}    path    path to be encoded
 * @returns {string}            encoded path
 */
helpers.prototype._encodeString = function(path) {
    return utf8.encode(path);
};

/**
 * converts all of object's "true" or "false" entries to booleans
 * @param   {object}    object  object to be typcasted
 * @return  {object}            typecasted object
 */
helpers.prototype._convertObjectToBool = function(object) {
    if (typeof(object) !== "object") {
        return object;
    }

    for (var key in object) {
        if (object[key] === "true") {
            object[key] = true;
        }
        if (object[key] === "false") {
            object[key] = false;
        }
    }

    return object;
};

/**
 * Handles Provisionging API boolean response
 */
helpers.prototype._OCSuserResponseHandler = function(data, resolve, reject) {
    var statuscode = parseInt(this._checkOCSstatusCode(data.data));
    if (statuscode === 999) {
        reject("Provisioning API has been disabled at your instance");
    }

    resolve(true);
};

/**
 * Recursive listing of all files and sub-folders
 * @param   {string}  path         local path to be recursively listed
 * @param   {string}  pathToStore  path to be stored at the OC instance
 * @returns {array}                array of objects : {
 *                                       path: path of the folder to be stored
 *                                       at the OC instance,
 *                                       localPath: localPath of the folder,
 *                                       files: contents of the folder
 *                                 }
 */
helpers.prototype._getAllFileInfo = function(path, pathToStore) {
    function getAllFileInfo(path, pathToStore, localPath) {
        var fl = 0;
        var baseAddr = pathToStore;

        for (var j = 0; j < filesToPut.length; j++) {
            if (filesToPut[j].path === baseAddr) {
                fl = 1;
                break;
            }
        }

        if (fl === 0) {
            var count = filesToPut.length;
            filesToPut[count] = {};
            filesToPut[count].path = baseAddr;
            filesToPut[count].localPath = localPath; ////////
            filesToPut[count].files = [];
            count++;
        }


        if (path.slice(-1) !== '/') {
            path += '/';
        }

        var files = fs.readdirSync(path);

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var stat = fs.statSync(path + file);

            if (stat.isDirectory()) {
                getAllFileInfo(path + file + '/', pathToStore + file + '/', localPath + file + '/');
            } else {
                baseAddr = pathToStore;
                fl = 0;

                for (j = 0; j < filesToPut.length; j++) {
                    if (filesToPut[j].path === baseAddr) {
                        filesToPut[j].files.push(file);
                        fl = 1;
                        break;
                    }
                }

                if (fl === 0) {
                    var count2 = filesToPut.length;
                    filesToPut[count2] = {};
                    filesToPut[count2].path = baseAddr;
                    filesToPut[count2].localPath = localPath; ////////
                    filesToPut[count2].files = [file];
                    count2++;
                }
            }
        }
    }

    var filesToPut = [];
    var targetPath = pathToStore;
    var localPath = path;

    if (!targetPath || targetPath === '') {
        targetPath = '/';
    }

    targetPath = this._normalizePath(targetPath);
    var slash = '';
    if (targetPath.slice(-1) !== '/') {
        targetPath += '/';
    }
    if (localPath.slice(-1) !== '/') {
        localPath += '/';
    }
    if (targetPath.slice(0, 1) !== '/') {
        slash = '/';
    }

    var pathToAdd = localPath.split('/');
    pathToAdd = pathToAdd.filter(function(n) {
        return n !== '';
    });
    var slash2 = '/';

    if (pathToAdd[pathToAdd.length - 1] === '.') {
        pathToAdd[pathToAdd.length - 1] = '';
        slash = '';
        slash2 = '';
    }

    pathToAdd = targetPath + slash + pathToAdd[pathToAdd.length - 1] + slash2;
    getAllFileInfo(path, pathToAdd, localPath);
    return filesToPut;
};

/**
 * gets the MTime of a file/folder
 * @param   {string}    path    path of the file/folder
 * @returns {Date}              MTime
 */
helpers.prototype._getMTime = function(path) {
    var info = fs.statSync(path);
    return info.mtime;
};

/**
 * gets the size of a file/folder
 * @param   {string}    path    path of the file/folder
 * @returns {integer}           size of folder
 */
helpers.prototype._getFileSize = function(path) {
    var info = fs.statSync(path);
    return parseInt(info.size);
};

/**
 * performs a PUT request from a file
 * @param   {string}  source     source path of the file to move/copy
 * @param   {string}  target     target path of the file to move/copy
 * @param   {object}  headers    extra headers to add for the PUT request
 * @returns {Promise.<status>}   boolean: whether the operation was successful
 * @returns {Promise.<error>}    string: error message, if any.
 */
helpers.prototype._webdavMoveCopy = function(source, target, method) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (method !== "MOVE" && method !== "COPY") {
            reject('Please specify a valid method');
            return;
        }

        source = self._normalizePath(source);

        target = self._normalizePath(target);
        target = encodeURIComponent(target);
        target = target.split('%2F').join('/');

        var headers = {
            'Destination': self._webdavUrl + target
        };

        self._makeDAVrequest(method, source, headers).then(data => {
            resolve(data);
        }).catch(error => {
            reject(error);
        });
    });
};

/**
 * gets the fileName from a path
 * @param  {string}  path  path to get fileName from
 * @return {string}        fileName
 */
helpers.prototype._getFileName = function(path) {
    var pathSplit = path.split('/');
    pathSplit = pathSplit.filter(function(n) {
        return n !== '';
    });
    return pathSplit[pathSplit.length - 1];
};

/**
 * returns all xml namespaces in an object
 * @param  {string} xml xml which has namespace
 * @return {object}     object with namespace
 */
helpers.prototype._getXMLns = function (xml) {
    var tree = parser2.xml2js(xml, {
        compact: true
    });
    var xmlns = tree['d:multistatus']._attributes;
    var replacedXMLns = {};

    for (var ns in xmlns) {
        var changedKey = ns.split(':')[1];
        replacedXMLns[changedKey] = xmlns[ns];
    }

    return replacedXMLns;
};

module.exports = helpers;
