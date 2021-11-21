const EventEmitter = require("events");

class RaftNode extends EventEmitter {
    constructor(raft, peer) {
        super();

        this.raft = raft;
        this.peer = peer;
        this.state = RaftNode.State.INITIAL;
    }

    setup() {
        return new Promise((resolve, reject) => {
            this.raft.transport.connect(this).then(() => {
                this.state = RaftNode.State.CONNECTED;
                setTimeout(() => {
                    this.send({
                        rpc: "discover"
                    });
                }, 0)
                resolve();
            }).catch((e) => {
                this.state = RaftNode.State.DEAD;
                reject(e);
            });
        });
    }

    send(message) {
        return this.raft.transport.send(this, message);
    }

    disconnect() {
        if(this.state != RaftNode.State.DEAD) {
            this.state = RaftNode.State.DEAD;
            this.raft.transport.disconnect(this);
            this.raft = null;
            this.peer = null;
        }
    }
}

RaftNode.State = {
    INITIAL: 1,
    CONNECTED: 2,
    ACTIVE: 3,
    DEAD: -1
}

module.exports = RaftNode;