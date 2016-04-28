const Q = require('q');
const http = require('http');
var exports = {};

const tokenCache = {};

const getSessionToken = function(ip, retries) {
    const retriesLeft = retries || 20;

    if(tokenCache[ip]) {
        return tokenCache[ip];
    }

    tokenCache[ip] = getSessionTokenInternal(ip, retriesLeft-1).then((res) => {
        const regexp = /\"sessionId\" value=\"(\d+)\"/g;
        const match = regexp.exec(res);

        if(match[1] === "0") {
            tokenCache[ip] = null;
            return Q.delay(1000).then( () => {
                return getSessionToken(ip, retriesLeft-1);
            });
        } else {
            return match[1];
        }
    });

    return tokenCache[ip];
};

const getSessionTokenInternal = function(ip, retriesLeft) {
   var deferred = Q.defer();

   if (retriesLeft == 0) {
       console.log(ip + " didn't answer after several retries");
       deferred.reject("Out of retries...");
       return deferred.promise;
   }

   http.get('http://' + ip + '/getLogin.asp?userName=root&passWd', (res) => {
           var body = '';
           res.on('data', function(d) {
               body += d;
           });

           res.on('end', (data) => {
               deferred.resolve(body);
           });

       }).on('error', (e) => {
           Q.delay(1000).then(() => {
               getSessionTokenInternal(ip, --retriesLeft).done((res) => {
                   deferred.resolve(res);
           });
       });
   });
   
   return deferred.promise;
};

exports.createPeer = function (aEndLabel, zEndLabel, aEndIp, zEndIp) {
   return getSessionToken(aEndIp)
   .then((token) => {
        const peerPromise = internalCreatePeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp)
        return peerPromise
            .then(() => {
                return configPeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp);
            });
    })
   .catch((err) => {
       console.log("Failed to get token for " + aEndIp);
       console.log(err);
   });
};

function internalCreatePeer(token, aEnd, zEnd, aEndIp, zEndIp) {
    const deferred = Q.defer();
    const path = '/mib/topo/peer/peer:' + aEnd + '/create.json';

    var options = {
        method: 'GET',
        hostname: aEndIp,
        path: path,
        headers: {
            cookie: "sessionId=" + token
        }
    };

    http.get(options, (res) => {
        var body = '';
        res.on('data', function(d) {
            body += d;
        });

        res.on('end', () => {
            deferred.resolve();
        });
    }, (err) => {
        deferred.reject(err);
    });

    return deferred.promise;
}

function configPeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp) {
    const promises = [];

    const explodedLabel = zEndLabel.split(":");
    const zSubrack = explodedLabel[0];
    const zSlot = explodedLabel[1];
    const zPort = explodedLabel[2];

    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerLocalLabel=" + aEndLabel));
    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteLabel=" + zEndLabel));
    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteIpAddress=" + zEndIp));
    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteSubrack=" + zSubrack));
    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteSlot=" + zSlot));
    promises.push(setConfig(aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemotePort=" + zPort));

    return Q.all(promises);
}

exports.createEquipment = function(ip, boards) {
    return getSessionToken(ip)
    .then(function(token) {
        return internalCreateEquipment(ip, token, boards);
    }).catch((err) => {
        console.log("Couldnt create eq for" + ip);
        console.log(err);
    });
};

function internalCreateEquipment(ip, token, boards) {
    const promises = [];
    boards.forEach((board) => {
        const deferred = Q.defer();
        var options = {
           method: 'GET',
           hostname: ip,
           path: '/mib/eq/board/' + board.toLowerCase() + '/create.json',
           headers: {
               cookie: "sessionId=" + token
           }
        };

       http.get(options, (res) => {
           var body = '';
           res.on('data', function(d) {
               body += d;
           });

           res.on('end', () => {
               deferred.resolve();
           });
       }, (err) => {
           console.log("request failed", err);
           console.log(err);
           deferred.reject(err);
       });

       promises.push(deferred.promise);
    });
    return promises;
}

function setConfig(ip, partialPath, arg) {
    const deferred = Q.defer();

    getSessionToken(ip).then((token) => {
        const path = partialPath + '/set.json?' + arg;
        console.log(path);

        const options = {
            method: 'GET',
            hostname: ip,
            path: path,
            headers: {
                cookie: "sessionId=" + token
            }
        };

        http.get(options, (res) => {
            var body = '';
            res.on('data', function (d) {
                body += d;
            });

            res.on('end', () => {
                deferred.resolve();
            });
        }, (err) => {
            console.log("request failed", err);
            deferred.reject(err);
        });
    });

    return deferred.promise;
}

module.exports = exports;

