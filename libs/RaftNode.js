const EventEmitter = require("events");
const Utils = require("./utils");

class RaftNode extends EventEmitter {
    constructor(raft, peer) {
        super();

        this.id = Utils.uuidv4();
        this.raft = raft;
        this.peer = peer;
        this.state = RaftNode.State.INITIAL;
    }

    changeState(state) {
        if(this.state != state) {
            this.state = state;

            switch (state) {
                case RaftNode.State.DISCOVERY:
                    setTimeout(() => {
                        this.send({
                            rpc: "discover"
                        });
                    }, 0);
                    break;
                case RaftNode.State.CONNECTED:
                    break;
                case RaftNode.State.DEAD:
                    this.raft.transport.disconnect(this);
                    this.raft = null;
                    this.peer = null;
                    break;
                default:
                    console.error("Invalid RaftNode State:", state);
            }
        } else {
            console.error("RaftNode already in the state:", state);
        }

        return this;
    }

    setup() {
        return new Promise((resolve, reject) => {
            this.raft.transport.connect(this).then((nodeID) => {
                this.changeState(RaftNode.State.DISCOVERY);
                if(nodeID) {
                    this.id = nodeID;
                }

                resolve();
            }).catch(reject);
        });
    }

    send(message) {
        return this.raft.transport.send(this, message);
    }

    disconnect() {
        this.changeState(RaftNode.State.DEAD);
    }
}

RaftNode.State = {
    INITIAL: 1,
    DISCOVERY: 2,
    CONNECTED: 3,
    DEAD: -1
}

module.exports = RaftNode;