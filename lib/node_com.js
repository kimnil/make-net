const Q = require('q');
const http = require('http');
const utils = require('./utils.js');
var exports = {};

const tokenCache = {};
const subrackCache = {"1:": Q()};

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
   console.log("=======================================");
   console.log("=========== Create internals===========", node.ip);
   console.log("=======================================");
   const promises = [];

   internals.forEach((internal, index) => {
       try {
           var aEnd = utils.internalLabel(node, internal[0]);
           var zEnd = utils.internalLabel(node, internal[1]);
       } catch (err) {
           console.log(err.stack);
       }

       var path = "/mib/topo/internal/int:" + aEnd + ":" + zEnd + "/create.json";

       var options = {
           method: 'GET',
           hostname: node.ip,
           path: path,
           headers: {
               cookie: "sessionId=" + token
           }
       };

       promises.push(Q.delay(1000 * (index+1)).then(() => {
           return doHttp(options);
       }));
   });

    const internalPromise = Q.all(promises);
    internalPromise.catch((err) => {
        console.log("An error occured when configuring internals, ", err) ;
        throw err;
    });

    return internalPromise;
};

exports.createAndConfigPeer = function(token, aEndLabel, zEndLabel, nodeA, nodeZ) {
    const promises = [];

    const aEndIp = nodeA.ip;
    const zEndIp = nodeZ.ip;
    const explodedLabel = zEndLabel.split(":");
    const zSubrack = explodedLabel[0];
    const zSlot = explodedLabel[1];
    const zPort = explodedLabel[2];

    const createAEndPromise = internalCreatePeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp);

    const createZEndPromise = createAEndPromise.then(() => {
        return internalCreatePeer(token, zEndLabel, aEndLabel, zEndIp, aEndIp);
    });

    createZEndPromise.then(() => {
        // A-End
        Q.delay(1000).then(() => {
            return setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerLocalLabel=" + utils.internalLabel(nodeA, aEndLabel));
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerRemoteLabel=" + utils.internalLabel(nodeZ, zEndLabel)));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerRemoteIpAddress=" + zEndIp));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerRemoteSubrack=" + zSubrack));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerRemoteSlot=" + zSlot));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, aEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeA, aEndLabel), "topoPeerRemotePort=" + zPort));
            });
        });

        // Z-End
        Q.delay(1000).then(() => {
            return setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerLocalLabel=" + utils.internalLabel(nodeZ, zEndLabel));
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerRemoteLabel=" + utils.internalLabel(nodeA, aEndLabel)));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerRemoteIpAddress=" + aEndIp));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerRemoteSubrack=" + aSubrack));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerRemoteSlot=" + aSlot));
            });
        }).then(() => {
            return Q.delay(1000).then(() => {
                promises.push(setConfig(token, zEndIp, "mib/topo/peer/peer:" + utils.internalLabel(nodeZ, zEndLabel), "topoPeerRemotePort=" + aPort));
            });
        });
    });

    return Q.all(promises);
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

exports.configureBoard = function(token, ip, boards) {
    console.log("=======================================");
    console.log("=========== Configure boards ==========", ip);
    console.log("=======================================");
    const promises = [];

    try {
        for (var i = 0, sleepFactor = 0; i < boards.length; i++) {
            for (var j = 0; j < boards[i].settings.length; j++) {
                sleepFactor += 1;
                promises.push(internalConfigureBoard(ip, token, boards[i].settings[j], 500 * sleepFactor));
            }
        }
    } catch (err) {
        console.log(err.stack);
    }
    const allEqPromise = Q.all(promises);
    allEqPromise.catch((err) => {console.log("Something went wrong creating boards", err, err.stack)});
    console.log("allConfPromise", allEqPromise);
    return allEqPromise;
};

function internalConfigureBoard(ip, token, settingsPath, sleepInMs) {
    console.log("internalConfBoard", ip);
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
    console.log("=======================================");
    console.log("=========== Create equipment ==========", ip);
    console.log("=======================================");
    const promises = [];

    boards.forEach((board, i) => {
            var options = {
                method: 'GET',
                hostname: ip,
                path: '/mib/eq/board/' + board.name.toLowerCase() + '/create.json',
                headers: {
                    cookie: "sessionId=" + token
                }
            };

            promises.push(Q.delay(1000 * (i + 1)).then(() => {
                return doHttp(options);
            }));
    });

    const allEqPromise = Q.all(promises);
    allEqPromise.catch((err) => {console.log("Aw snap", err)});
    return allEqPromise;
};

exports.createSubracks = function(token, ip, boards) {
    console.log("=======================================");
    console.log("=========== Create subracks ===========", ip);
    console.log("=======================================");
    const promises = [];

    boards.forEach((board, i) => {
        var subrackIndex = board.name.split(":")[1];
        var path = "/mib/eq/subrack/tm3000:" + subrackIndex + "/create.json";

        if (subrackCache[subrackIndex]) {
            return;
        }

        const options = {
            method: 'GET',
            hostname: ip,
            path: path,
            headers: {
                cookie: "sessionId=" + token
            }
        };

        subrackCache[subrackIndex] = Q.delay(1500*(i+1)).then(() => {
            return doHttp(options)
        });
        promises.push(subrackCache[subrackIndex]);
    });

    const allSubracksPromise = Q.all(promises);
    allSubracksPromise.catch((err) => {console.log("Something went wrong creating subracks", err, err.stack)});
    return allSubracksPromise;
};

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
            console.log("\n " + Math.floor(Date.now() / 1000) + ": HTTP: ", options.hostname + "/" + options.path);
            console.log(options);
//            console.log("\n Body:", body);
            deferred.resolve(body);
        });

    }).on('error', (e) => {
        deferred.reject(e);
    });

    return deferred.promise;
}

module.exports = exports;

