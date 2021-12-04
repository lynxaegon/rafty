const Timer = require("../../libs/Timer")
const { promisify } = require("util");

const TTL = 5;
module.exports = class Discovery {
    bind(raft) {
        this.redis = require("redis").createClient();
        this.redisGet = promisify(this.redis.get).bind(this.redis);

        this.redis.on("error", function(error) {
            console.error("REDIS Err:", error);
        });

        this.port = raft.transport.port;
        this.redis.setex("servers:" + raft.id, TTL, JSON.stringify({
            info: {
                port: raft.transport.port
            }
        }));
        this.keepalive = new Timer(TTL / 2 * 1000, () => {
            this.redis.expire("servers:" + raft.id, TTL);
        });
        this.keepalive.indefinite();
    }

    discover(callback) {
        this.redis.keys("servers:*", (err, result) => {
            let promises = [];
            for(let key of result) {
                promises.push(this.redisGet(key));
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
        this.redis.del("servers:" + raft.id);
        this.redis.quit();
    }
}