#!/usr/bin/node --harmony

const fs = require('fs');
const cp = require('child_process');
const nodeCom = require('../lib/node_com.js');
const utils = require('../lib/utils.js');
const Q = require('q');
const LOGIN_RETRIES = 20;

const stdio = process.stdin,
      stdout = process.stdout;

if (process.argv.length < 3) {
    stdout.write("You did not supply a net specification file! How am I suppouse to know what network you want me to make!?\n");
    showUsage();
    process.exit();
}

const args = process.argv.slice(2);
const netSpecFile = args[0];

const spec = parseFile(netSpecFile);
const netSpec = spec.nodes;
const peers = spec.peers;
const nodes = readNodeSpecs(netSpec);

spawnContainers(nodes);
logNodes(nodes);

Object.keys(nodes).forEach((nodeLabel) => {
    const node = nodes[nodeLabel];

    const sessionPromise = nodeCom.getSessionToken(node.ip, LOGIN_RETRIES);
    sessionPromise.then((token) => {
        const subrackPromise = nodeCom.createSubracks(token, node.ip, node.boards);
        const eqPromise = subrackPromise.then(() => { return nodeCom.createEquipment(token, node.ip, node.boards)});
        const confPromise = eqPromise.then(() => { return nodeCom.configureBoard(token, node.ip, node.boards)});
        const internalsPromise = confPromise.then(() => { return nodeCom.createInternals(token, node, node.internals)});
        const peersPromise = internalsPromise.then(() => { return createPeers(token, peers) });

        return peersPromise;
    });
    sessionPromise.fail((err) => errHandler(err));
});

function errHandler(err) {
    console.log("An error occured", err);
    killContainers(nodes);
}

function showUsage() {
    stdout.write("\n");
    stdout.write("Usage: \n");
    stdout.write("auto-node-setup my-net-specification.json \n");
}

function parseFile(pathToNetSpec) {
    var data;

    try {
        data = fs.readFileSync(pathToNetSpec, 'utf8');
    } catch(err) {
        console.log("Could not open " + pathToNetSpec);
        console.log("Are you sure it exists and is readable for me? \nI was looking for it here: " + process.cwd());
        process.exit();
    }

    try {
        return JSON.parse(data);
    } catch (err) {
        console.log("I found " + pathToNetSpec + " but I didn't like it! I could not parse it. Invalid JSON?");
    }
}

function readNodeSpecs(netSpec) {
    const specs = {};
    for (nodeName in netSpec) {
        if (netSpec.hasOwnProperty(nodeName)) {
            specs[nodeName] = specs[nodeName] || parseFile(netSpec[nodeName]);
        }
    }
    return specs;
}

function spawnContainers(nodes) {
    Object.keys(nodes).forEach((node) => {
        nodes[node].hash = spawnContainer(nodes[node]);
        nodes[node].ip = getIpFromHash(nodes[node].hash);
    });
}

function spawnContainer(node) {
    const command = "docker run -e \"DEMO=true\" --privileged -dit " + node.container.base + ":" + node.container.version;
    console.log("Executing " + command);
    return cp.execSync(command).toString('utf8');
}

function killContainers(nodes) {
    console.log("Cleaning up...");
    var nodeHashes = "";

    for(node in nodes) {
        if (nodes.hasOwnProperty(node)) {
            nodeHashes += " " + nodes[node].hash;
        }
    }

    const command = "docker kill" + nodeHashes;
    console.log("Executing " + command);
    return cp.execSync(command).toString('utf8');
}


function getIpFromHash(hash) {
    const buffer = cp.execSync("docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "+hash);
    return buffer.toString('utf8').trim();
}

function logNodes(nodes) {
    Object.keys(nodes).forEach( (node) => {
        console.log(node + "\t" + nodes[node].ip);
    });
}

function createPeers(token, peers) {
    console.log("=======================================");
    console.log("=========== Create peers ==============");
    console.log("=======================================");

    try {
        const promises = [];
        peers.forEach((peer, index) => {
            const aEnd = peer[0];
            const zEnd = peer[1];
            const nodeA = nodes[utils.peerToNodeName(aEnd)];
            const nodeZ = nodes[utils.peerToNodeName(zEnd)];
            const aEndLabel = utils.peerToLabel(nodeA, aEnd);
            const zEndLabel = utils.peerToLabel(nodeZ, zEnd);

            // Too long sleep here, sort by IP and do several nodes concurrently!
            const peerPromise = Q.delay(7000 * index).done(() => {
                nodeCom.createAndConfigPeer(token, aEndLabel, zEndLabel, nodeA, nodeZ)
            });
            promises.push(peerPromise);
        });

        const peersPromise = Q.all(promises);

        peersPromise.catch((err) => {
            console.log("Something went south when creating peers", err);
            throw err;
        });
    } catch (err) {
        console.log(err);
        console.log(err.stack);
    }

    return peersPromise;
}

