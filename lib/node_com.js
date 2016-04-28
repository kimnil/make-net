const Q = require('q');
const http = require('http');
var exports = {};

const getSessionToken = function(ip, retries) {
    const retriesLeft = retries || 20;
    return getSessionTokenInternal(ip, retriesLeft-1).then((res) => {
        const regexp = /\"sessionId\" value=\"(\d+)\"/g;
        const match = regexp.exec(res);

        if(match[1] === "0") {
            return Q.delay(1000).then( () => {
                return getSessionToken(ip, retriesLeft-1);
            });
        } else {
            return match[1];
        }
    });
};

const getSessionTokenInternal = function(ip, retriesLeft) {
   var deferred = Q.defer();
    console.log("getSessionTokenInternal", ip, retriesLeft);

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

// (aEnd, zEnd, aEndIp, zEndIp);
exports.createPeer = function (aEndLabel, zEndLabel, aEndIp, zEndIp) {
   return getSessionToken(aEndIp)
   .then((token) => {
        return internalCreatePeer(token, aEndLabel, zEndLabel, aEndIp, zEndIp);
    })
   .catch((err) => {
       console.log("Failed to get token for " + aEndIp)
       console.log(err);
   });
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

    return http.get(options, (res) => {
        var body = '';
        res.on('data', function(d) {
            body += d;
        });

        res.on('end', () => {
            console.log("Done with peer creation", body);
        });
    }, (err) => {
        console.log("request failed", err);
        console.log(err);
    });
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
        var options = {
           method: 'GET',
           hostname: ip,
           path: '/mib/eq/board/' + board.toLowerCase() + '/create.json',
           headers: {
               cookie: "sessionId=" + token
           }
        };

       promises.push(http.get(options, (res) => {
           var body = '';
           res.on('data', function(d) {
               body += d;
           });

           res.on('end', () => {
               console.log("Done with board creation");
           });
       }, (err) => {
           console.log("request failed", err);
           console.log(err);
       }));
    });
    return promises;
}

module.exports = exports;

