#!/usr/bin/env node

const fs = require('fs');
const cp = require('child_process');
const nodeCom = require('../lib/node_com.js');

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
console.log(spec);
const netSpec = spec.nodes;
const peers = spec.peers;
const nodes = readNodeSpecs(netSpec);

spawnContainers(nodes);
createEquipment(nodes);
createPeers(peers);
logNodes(nodes);

function showUsage() {
    stdout.write("\n");
    stdout.write("Usage: \n");
    stdout.write("make-net my-net-specification.json \n");
}

function parseFile(pathToNetSpec) {
    try {
        const data = fs.readFileSync(pathToNetSpec, 'utf8');
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
       specs[nodeName] = specs[nodeName] || parseFile(netSpec[nodeName]); 
    }
    return specs;
}

function spawnContainers(nodes) {
    for(node in nodes) {
       nodes[node].hash = spawnContainer(nodes[node].container);
       nodes[node].ip = getIpFromHash(nodes[node].hash);
    }
}

function spawnContainer(container) {
    const command = "docker run --privileged -dit " + container;
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

function createEquipment(nodes) {
    Object.keys(nodes).forEach((nodeName) => {
        const node = nodes[nodeName];
        nodeCom.createEquipment(node.ip, node.boards);
    });
}

function createPeers(peers) {
    peers.forEach((peer) => {
        const aEnd = peer[0];
        const zEnd = peer[1];
        const aEndIp = nodes[aEnd.substr(0, aEnd.indexOf(':'))].ip;
        const zEndIp = nodes[aEnd.substr(0, aEnd.indexOf(':'))].ip;
    });
}
