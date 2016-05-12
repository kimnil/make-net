var exports = {};
// A:1:1:2 --> A
exports.peerToNodeName = function (end) {
    return end.substr(0, end.indexOf(':'));
};

// >= R27
// A:1:1:2 --> 1:1:0:2
//
// < R27
// A:1:1:2 --> 1:1:2
exports.peerToLabel = function(node, end) {
    const nodeVersion = node.container.version;
    const subSlotPort = end.substr(end.indexOf(':')+1);

    // If peer is already written with MPO port inluded, just use it.
    if ((subSlotPort.match(/\:/g)||[]).length === 3) {
        return subSlotPort;
    }

    // Depending on container version, add a MPO identifer.
    if (nodeVersion === "latest" || nodeVersion >= 27) {
        const slotPortSepPos = subSlotPort.indexOf(":", 2);
        return subSlotPort.slice(0, slotPortSepPos) + ":0" + subSlotPort.slice(slotPortSepPos);
    } else {
        return subSlotPort;
    }
};

// >= R27
// 1:1:2 --> 1:1:0:2
//
// < R27
// 1:1:2 --> 1:1:2
exports.internalLabel = function(node, subSlotPort) {
    const nodeVersion = node.container.version;

    // If peer is already written with MPO port inluded, just use it.
    if ((subSlotPort.match(/\:/g)||[]).length === 3) {
        return subSlotPort;
    }

    // Depending on container version, add a MPO identifer.
    if (nodeVersion === "latest" || nodeVersion >= 27) {
        const slotPortSepPos = subSlotPort.indexOf(":", 2);
        return subSlotPort.slice(0, slotPortSepPos) + ":0" + subSlotPort.slice(slotPortSepPos);
    } else {
        return subSlotPort;
    }
};

module.exports = exports;
