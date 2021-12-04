const Rafty = require("./libs/Rafty");
const AnySocket = require("anysocket");
const redis = require("redis").createClient();
const { promisify } = require("util");
const redisGet = promisify(redis.get).bind(redis);

redis.on("error", function(error) {
    console.error("REDIS Err:", error);
});

let rafts = [];
let args = process.argv.splice(2);
let index = 0;
function createNode() {
    let PORT = 8080 + index;
    let anysocket = new AnySocket();
    let raft = new Rafty(anysocket.id, {
        port: PORT
    });
    rafts.push(raft);
    // anysocket.id = PORT;
    const connectionsAccepted = {};

    redis.set("servers:" + anysocket.id, JSON.stringify({
        info: {
            port: PORT
        }
    }));

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
            start: () => {
                return new Promise((resolve, reject) => {
                    anysocket.listen("ws", PORT);
                    resolve();
                });
            },
            connect: (node) => {
                return new Promise((resolve, reject) => {
                    if(typeof node.peer == "object")  {
                        node.peer.on("message", (packet) => {
                            node.emit("data", packet.msg);
                        });

                        resolve(node.peer.id);
                    } else {
                        anysocket.connect("ws", "127.0.0.1", node.peer)
                            .then((peer) => {
                                connectionsAccepted[peer.id] = true;
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
            },
            send: (node, message) => {
                return new Promise((resolve, reject) => {
                    node.peer.send(message);
                    resolve();
                });
            },
            disconnect: (node) => {
                return new Promise((resolve, reject) => {
                    if(node.peer && node.peer.disconnect) {
                        node.peer.disconnect();
                    }
                    resolve();
                });
            },
            stop: () => {
                return anysocket.stop();
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

if(args[0])
{
    index = parseInt(args[0]);
    // testing only
    if(index == 0) {
        redis.flushall();
        setTimeout(() => {
            rafts[0].stop();
            redis.quit();
        }, 3 * 1000);
    }

    createNode();
}

// setTimeout(() => {
//     rafts[0].test();
//     rafts[1].test();
//     rafts[2].test();
// }, 2000);