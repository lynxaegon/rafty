const AnySocket = require("anysocket");

module.exports = class Transport {
    constructor(port) {
        this.port = port;
        this.raft = null;
        this.anysocket = new AnySocket();
        this.connectionsAccepted = {};

        this.anysocket.on("connected", (peer) => {
            if(this.connectionsAccepted[peer.id]) {
                delete this.connectionsAccepted[peer.id];
            } else {
                this.raft.join(peer);
            }
        });

        this.anysocket.on("disconnected", (peer) => {
            this.raft.leave(peer);
        });
    }

    getId() {
        return this.anysocket.id;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.anysocket.listen("ws", this.port);
            resolve();
        });
    }

    connect(node) {
        return new Promise((resolve, reject) => {
            if(typeof node.peer == "object")  {
                node.peer.on("message", (packet) => {
                    node.emit("data", packet.msg);
                });

                resolve(node.peer.id);
            } else {
                this.anysocket.connect("ws", "127.0.0.1", node.peer)
                    .then((peer) => {
                        this.connectionsAccepted[peer.id] = true;
                        node.peer = peer;

                        node.peer.on("message", (packet) => {
                            node.emit("data", packet.msg);
                        });
                        resolve(peer.id);
                    })
                    .catch((reason) => {
                        reject(reason);
                    });
            }
        });
    }

    send(node, message) {
        return new Promise((resolve, reject) => {
            node.peer.send(message);
            resolve();
        });
    }

    disconnect(node) {
        return new Promise((resolve, reject) => {
            if(node.peer && node.peer.disconnect) {
                node.peer.disconnect();
            }
            resolve();
        });
    }

    stop() {
        return this.anysocket.stop();
    }
};