var Q = require('q');
var https = require('https');
var parseUrl = require('url').parse;
var childProcess = require('child_process');
var settings = require('./settings');

var http = module.exports.http = {};


var request = function request(params) {
    var options = parseUrl(params.url);
    options.method = params.method || 'GET';
    options.headers = params.headers;
    if (params.user && params.password) {
      options.auth = params.user + ":" + params.password;
    }
    var deferred = Q.defer();

    var request = https.request(options, function(response) {
        var statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
            deferred.resolve(response);
        } else {
            http.readBody(response)
            .then(function(body) {
              var msg = 'Status code was: ' +
                statusCode +
                '. Request configuration: ' +
                JSON.stringify(options, null, 2) +
                '\n Response body: ' + body;
              deferred.reject(new Error(msg));
            })
            .fail(function(err) {
              deferred.reject(new Error(err));
            })

        }
    });

    request.on('error', function(error) {
        deferred.reject(new Error('Request failed: ' + error));
    });

    if (params.data) {
      request.write(params.data, 'utf8');
    }

    request.end();

    return deferred.promise;
};


function defaultRequest(method, url, data) {
  return request({
    url: url,
    method: method,
    user: settings.user,
    password: settings.password,
    data: JSON.stringify(data),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Worblehat Setup'
    }
  });
}

http.get = defaultRequest.bind(null, 'GET');
http.post = defaultRequest.bind(null, 'POST');
http.put = defaultRequest.bind(null, 'PUT');
http.del = defaultRequest.bind(null, 'DELETE');


http.readBody = function readBody(response) {
  var deferred = Q.defer();

  var data = [];
  response.setEncoding('utf8');
  response.on('data', function(chunk) {
      data.push(chunk);
  });
  response.on('end', function() {
      deferred.resolve(data.join());
  });
  response.on('error', function() {
      deferred.reject(new Error('Failed reading response body: ' + error));
  });

  return deferred.promise;
};


module.exports.tap = function(prefix) {
  return function(val) {
    console.log('%s:', prefix, val);
    return val;
  }
};

module.exports.exec = function exec(cmd, env) {
  console.log('Executing command: %s', cmd);
  var deferred = Q.defer();

  childProcess.exec(cmd, {env: env}, function(error) {
    if (error) {
      deferred.reject(new Error(error));
    } else {
      deferred.resolve();
    }
  })

  return deferred.promise;
};
