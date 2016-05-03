const Q = require('q');
const http = require('http');
const objectAssign = require('object-assign');
var exports = {};

const tokenCache = {};
const subrackCache = {};

exports.getSessionToken = function(ip, retries, defer) {
    const retriesLeft = retries || 20;
    const deferred = defer || Q.defer();

    if(tokenCache[ip]) {
        return tokenCache[ip]
            .then(token => deferred.resolve(token));
    }

    tokenCache[ip] = getSessionTokenInternal(ip, retriesLeft-1);
    tokenCache[ip].then((res) => {
        const regexp = /\"sessionId\" value=\"(\d+)\"/g;
        const match = regexp.exec(res);

        if(match[1] === "0") {
            tokenCache[ip] = null;
            return Q.delay(1000).then( () => {
                return exports.getSessionToken(ip, retriesLeft-1, deferred);
            });
        } else {
            console.log("Successfully logged in to ", ip);
            deferred.resolve(match[1]);
        }
    });
    tokenCache[ip].catch((err) => {
        console.log("getSessionTokenInternal failed");
        console.log(err);
    });

    return deferred.promise;
};

const getSessionTokenInternal = function(ip, retriesLeft, defer) {
    var deferred = defer || Q.defer();

    if (retriesLeft == 0) {
       console.log(ip + " didn't answer after several retries");
       deferred.reject("Out of retries...");
       return deferred.promise;
    }

    const options = {
        method: 'GET',
        hostname: ip,
        path: 'getLogin.asp?userName=root&passWd'
    };

    doHttp(options)
        .then((response) => {
            deferred.resolve(response);
        })
        .catch((err) => {
            return Q.delay(1000).then(() => {
                return getSessionTokenInternal(ip, --retriesLeft, deferred);
            });
        });

   return deferred.promise;
};

exports.createInternals = function(token, node, internals) {
   const promises = [];

   for(var i = 0; i < internals.length; i++) {
       try {
           var internal = internals[i];
           var aEnd = internal[0];
           var zEnd = internal[1];
           var path = "/mib/topo/internal/int:" + aEnd + ":" + zEnd + "/create.json";

           var options = {
               method: 'GET',
               hostname: node.ip,
               path: path,
               headers: {
                   cookie: "sessionId=" + token
               }
           };

           (function () {
               var optionsCopy = objectAssign({}, options);
               Q.delay(1000 * (i + 1)).then(() => {
                   promises.push(doHttp(optionsCopy));
               });
           })();
       } catch (erro) {
           console.log(erro);
       }
   }

    const internalPromise = Q.all((promises));
    internalPromise.catch((err) => {
        console.log("An error occured when configuring internals, ", err) ;
        throw err;
    });

    return internalPromise;
};

exports.createPeer = function (token, aEndLabel, zEndLabel, aEndIp, zEndIp) {
    const peerPromise = internalCreatePeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp);
    const configPromise = peerPromise.then(() => {
        return configPeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp)
    });

    return configPromise;
};

function internalCreatePeer(token, aEnd, zEnd, aEndIp, zEndIp) {
    const path = '/mib/topo/peer/peer:' + aEnd + '/create.json';

    var options = {
        method: 'GET',
        hostname: aEndIp,
        path: path,
        headers: {
            cookie: "sessionId=" + token
        }
    };

    return doHttp(options);
}

function configPeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp) {
    const promises = [];

    const explodedLabel = zEndLabel.split(":");
    const zSubrack = explodedLabel[0];
    const zSlot = explodedLabel[1];
    const zPort = explodedLabel[2];

    Q.delay(500).then(() => {
        return setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerLocalLabel=" + aEndLabel);
    }).then(() => {
       return Q.delay(500).then( () => {
           promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteLabel=" + zEndLabel));
       }) ;
    }).then(() => {
        return Q.delay(500).then( () => {
            promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteIpAddress=" + zEndIp));
        }) ;
    }).then(() => {
        return Q.delay(500).then( () => {
            promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteSubrack=" + zSubrack));
        }) ;
    }).then(() => {
        return Q.delay(500).then( () => {
            promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemoteSlot=" + zSlot));
        }) ;
    }).then(() => {
        return Q.delay(500).then( () => {
            promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + aEndLabel, "topoPeerRemotePort=" + zPort));
        }) ;
    });

    return Q.all(promises);
}
exports.configureBoard = function(token, ip, boards) {
    const promises = [];

    for(var i = 0, sleepFactor = 0; i < boards.length; i++) {
        for(var j = 0; j < boards[i].settings.length; j++) {
            sleepFactor += 1;
            promises.push(internalConfigureBoard(ip, token, boards[i].settings[j], 500 * sleepFactor));
        }
    }
    const allEqPromise = Q.all(promises);
    allEqPromise.catch((err) => {console.log("Aw snap", err)});
    return allEqPromise;
};

function internalConfigureBoard(ip, token, settingsPath, sleepInMs) {
    const options = {
        method: 'GET',
        hostname: ip,
        path: "mib/" + settingsPath,
        headers: {
            cookie: "sessionId=" + token
        }
    };

    const sleepPromise = Q.delay(sleepInMs);

    return sleepPromise.then(() => {
        return doHttp(options)
    });
};

exports.createEquipment = function(token, ip, boards) {
    console.log("Create equipment", ip, boards);
    const promises = [];

    for(var i = 0; i < boards.length; i++) {
        promises.push(internalCreateEquipment(ip, token, boards[i], 1000*i));
    }

    console.log("Promises that goes into allEqPromise", promises);
    const allEqPromise = Q.all(promises);

    allEqPromise.catch((err) => {console.log("Aw snap", err)});

    return allEqPromise;
};

function internalCreateEquipment(ip, token, board, sleepInMs) {
    var options = {
       method: 'GET',
       hostname: ip,
       path: '/mib/eq/board/' + board.name.toLowerCase() + '/create.json',
       headers: {
           cookie: "sessionId=" + token
       }
    };

    const sleepPromise = Q.delay(sleepInMs);

    const subrackPromise = sleepPromise.then(() => {
        return createSubrackForBoard(token, ip, board);
    });

    return Q.delay(500).then(() => {
        return subrackPromise.then(() => {
            return doHttp(options)
        });
    });
}

function createSubrackForBoard(token, ip, board) {
    console.log("createSubRackForBoard", token, ip, board);
    const subrackIndex = board.name.split(":")[1];
    const path = "/mib/eq/subrack/tm3000:" + subrackIndex + "/create.json";


    if (subrackCache[subrackIndex]) {
        return subrackCache;
    }

    const options = {
        method: 'GET',
        hostname: ip,
        path: path,
        headers: {
            cookie: "sessionId=" + token
        }
    };

    subrackCache[subrackIndex] = doHttp(options);
    return subrackCache[subrackIndex];
}

function setConfig(token, ip, partialPath, arg) {
    const path = partialPath + '/set.json?' + arg;

    const options = {
        method: 'GET',
        hostname: ip,
        path: path,
        headers: {
            cookie: "sessionId=" + token
        }
    };

    return doHttp(options);
}

function doHttp(options) {
    const deferred = Q.defer();

    http.get(options, (res) => {
        var body = '';
        res.on('data', function(d) {
            body += d;
        });

        res.on('end', (data) => {
            console.log("\n HTTP:", options.hostname + "/" + options.path);
//            console.log("\n Body:", body);
            deferred.resolve(body);
        });

    }).on('error', (e) => {
        deferred.reject(e);
    });

    return deferred.promise;
}

module.exports = exports;

