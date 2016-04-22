const Q = require('q');
const http = require('http');
var exports = {}

const getSessionToken = function(ip) {
    return getSessionTokenInternal(ip, 20).then((res) => {
        const regexp = /\"sessionId\" value=\"(\d+)\"/g;
        const match = regexp.exec(res);


        if(match[1] === "0") {
            return getSessionToken(ip);
        } else {
            return match[1];
        };
    });
}

const getSessionTokenInternal = function(ip, retriesLeft) {
   var deferred = Q.defer();

   if (retriesLeft == 0) {
       console.log(ip + " didn't answer after several retries");
       deferred.reject("Out of retries...");
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
}

exports.createEquipment = function(ip, boards) {
    getSessionToken(ip).then(function(token) {
        internalCreateEquipment(ip, token, boards);
    }).catch((err) => {
        console.log("Couldnt create eq for" + ip);
        console.log(err);
    });
}

function internalCreateEquipment(ip, token, boards) {
    boards.forEach((board) => {
        var options = {
           method: 'GET',
           hostname: ip,
           path: '/mib/eq/board/' + board.toLowerCase() + '/create.json',
           headers: {
               cookie: "sessionId=" + token
           }
        }

       http.get(options, (res) => {
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
       });
    });
}

module.exports = exports;

