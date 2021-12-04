const redis = require("redis").createClient();
const { promisify } = require("util");
const redisGet = promisify(redis.get).bind(redis);
const Timer = require("../../libs/Timer")

redis.on("error", function(error) {
    console.error("REDIS Err:", error);
});

const TTL = 5;
module.exports = class Discovery {
    bind(raft) {
        this.port = raft.transport.port;
        redis.setex("servers:" + raft.id, TTL, JSON.stringify({
            info: {
                port: raft.transport.port
            }
        }));
        this.keepalive = new Timer(TTL / 2 * 1000, () => {
            redis.expire("servers:" + raft.id, TTL);
        });
        this.keepalive.indefinite();
    }

    discover(callback) {
        redis.keys("servers:*", (err, result) => {
            let promises = [];
            for(let key of result) {
                promises.push(redisGet(key));
            }

            Promise.all(promises).then((result) => {
                let servers = [];
                for(let item of result) {
                    item = JSON.parse(item);
                    if(item.info.port != this.port) {
                        servers.push(item.info.port);
                    }
                }
                callback(servers);
            }).catch((err) => {
                console.log("Discovery failed!", err);
                callback([]);
            });
        });
    }

    unbind(raft) {
        this.keepalive.cancel();
        redis.del("servers:" + raft.id);
        redis.quit();
    }
}