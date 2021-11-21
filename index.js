const Rafty = require("./libs/Rafty");
const AnySocket = require("anysocket");
const redis = require("redis").createClient();
const { promisify } = require("util");
const redisGet = promisify(redis.get).bind(redis);

redis.on("error", function(error) {
    console.error("REDIS Err:", error);
});

let rafts = [];

let index = 0;
function createNode() {
    let PORT = 8080 + index;
    let raft = new Rafty({
        port: PORT
    });
    rafts.push(raft);
    let anysocket = new AnySocket();
    // anysocket.id = PORT;
    const connectionsAccepted = {};

    redis.set("servers:" + anysocket.id, JSON.stringify({
        info: {
            port: PORT
        }
    }));

    anysocket.listen("ws", PORT);
    index++;

    anysocket.on("connected", (peer) => {
        if(connectionsAccepted[peer.id]) {
            delete connectionsAccepted[peer.id];
        } else {
            raft.join(peer);
        }
    });

    anysocket.on("disconnected", (peer) => {
        raft.leave(peer);
    });

    raft
        .setTransport({
            connect: (node) => {
                return new Promise((resolve, reject) => {
                    if(typeof node.peer == "object")  {
                        node.peer.on("message", (packet) => {
                            node.emit("data", packet.msg);
                        });

                        if(raft.hasNode(item => item.peer.id == node.peer.id)) {
                            return reject("onConnect Err: Duplicate node found!")
                        }
                        resolve();
                    } else {
                        anysocket.connect("ws", "127.0.0.1", node.peer)
                            .then((peer) => {
                                connectionsAccepted[peer.id] = true;
                                node.peer = peer;

                                if(raft.hasNode(node => node.peer.id == peer.id)) {
                                    return reject("onConnect Err: Duplicate found!")
                                }

                                node.peer.on("message", (packet) => {
                                    node.emit("data", packet.msg);
                                });
                                resolve();
                            })
                            .catch((reason) => {
                                reject(reason);
                            });
                    }
                });
            },
            send: (node, message) => {
                return new Promise((resolve, reject) => {
                    node.peer.send(message);
                    resolve();
                });
            },
            disconnect: (node) => {
                node.peer.disconnect();
            }
        })
        .setDiscovery((callback) => {
            redis.keys("servers:*", (err, result) => {
                let promises = [];
                for(let key of result) {
                    promises.push(redisGet(key));
                }

                Promise.all(promises).then((result) => {
                    let servers = [];
                    for(let item of result) {
                        item = JSON.parse(item);
                        if(item.info.port != PORT) {
                            servers.push(item.info.port);
                        }
                    }
                    callback(servers);
                }).catch((err) => {
                    console.log("Discovery failed!", err);
                    callback([]);
                })
            });
        })
        .start();
}

// testing only
redis.flushall();

// createNode();
createNode();
createNode();
createNode();


setTimeout(() => {
    rafts[0].test();
    rafts[1].test();
    rafts[2].test();
}, 2000);