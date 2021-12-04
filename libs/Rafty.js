const EventEmitter = require("events");
const NotifyableProperty = require("./NotifyableProperty");
const RaftNode = require("./RaftNode");
const Utils = require("./utils");
const Timer = require("./Timer");

class Rafty extends EventEmitter {
    constructor(id, options) {
        super()

        this.id = id || Utils.uuidv4();
        this.options = Object.assign({
            heartbeat: 50,
            electionMin: 150,
            electionMax: 200
        }, options);

        this.heartbeatTimer = new Timer(this.options.heartbeat, () => {
            this.broadcast(this._messageHeartbeat());
        });
        this.electionTimer = new Timer([this.options.electionMin, this.options.electionMax], () => {
            this.state = Rafty.State.CANDIDATE;
        });
        this.voteTimer = new Timer([this.options.electionMin, this.options.electionMax], () => {
            if(!this.voted) {
                this.voted = true;
                this.votes++;
                console.log("[" + this.id + "] Voted for:", "self");
                this.broadcast(this._messageVoteForSelf());
            }
        });

        this.totalVotes = 0;
        this.votes = 0;
        this.voted = false;
        this.nodes = NotifyableProperty(this, "nodes", [], this.onPropertyChanged.bind(this), {unique: true});
        this.state = NotifyableProperty(this, "state", Rafty.State.DEAD, this.onPropertyChanged.bind(this));
        this.term = NotifyableProperty(this, "term", 0, this.onPropertyChanged.bind(this));
        this.leader = NotifyableProperty(this, "leader", null, this.onPropertyChanged.bind(this));
        this.connectingNodes = 0;
    }

    setTransport(transport) {
        this.transport = transport
        return this;
    }

    setDiscovery(discoverFnc) {
        this.discover = discoverFnc;
        return this;
    }

    join(peer) {
        let node = new RaftNode(this, peer);
        this.connectingNodes++;

        node.setup().then(() => {
            if(this.hasNode(node.id)) {
                throw new Error("Duplicate node found!")
            }

            this.nodes.push(node);
            this.connectingNodes--;
        }).catch((e) => {
            this.connectingNodes--;
            console.log("Failed to connect to peer: \""+peer+"\". Reason:", e);
            node.disconnect();
        });
    }

    hasNode(nodeID) {
        if(this.id == nodeID)
            return true;

        for(let node of this.nodes) {
            if(node.id == nodeID) {
                return true;
            }
        }

        return false;
    }

    leave(peer) {
        this.nodes.remove(peer, (item) => item.peer == peer);
    }

    start() {
        if (!this.transport) {
            throw new Error("No transport has been configured!");
        }
        this.transport.start().then(() => {
            this.state = Rafty.State.CONNECTING;

            // Auto discover if available
            if(this.discover) {
                this.discover((peers) => {
                    for (let peer of peers) {
                        this.join(peer);
                    }
                    if(peers.length <= 0) {
                        this.state = Rafty.State.CANDIDATE;
                    }
                });
            }
        }).catch(e => {
            console.error("Couldn't start transport. Err:", e);
        });
    }

    stop() {
        while(this.nodes.length > 0) {
            this.leave(this.nodes[0].peer);
        }

        this.heartbeatTimer.cancel();
        this.voteTimer.cancel();
        this.electionTimer.cancel();

        this.state = Rafty.State.DEAD;
        this.term = -1;

        this.transport.stop().then(() => {
            this.transport = null;
            this.discover = null;
            console.log("transport stopped!");
        }).catch(e => {
            console.error("Couldn't start transport. Err:", e);
        });
    }

    broadcast(message) {
        for(let node of this.nodes) {
            if(node.state == RaftNode.State.CONNECTED) {
                node.send(message);
            }
        }
    }

    // TODO: LOGIC
    // 1. connect to a random server
    // 2. request discovery
    // 3. connect to nodes from discovery_reply
    // 4. repeat until connected to all nodes
    // 5. find leader
    // 6. request snapshot from leader
    // 7. catchup with leader
    // 8. change state to FOLLOWER
    // 9. ACT AS FOLLOWER
    receive(node, data) {
        switch(data.rpc) {
            case "discover":
                node.send(this._messageDiscoveryReply());
                break;
            case "discover_reply":
                // TODO: do something with the reply from discovery
                node.changeState(RaftNode.State.CONNECTED);
                let meshReady = false;
                if(this.connectingNodes == 0) {
                    meshReady = true;
                }
                if(meshReady) {
                    for (let node of this.nodes) {
                        if (node.state != RaftNode.State.CONNECTED) {
                            meshReady = false;
                            break;
                        }
                    }
                }

                if(meshReady && this.state == Rafty.State.CONNECTING) {
                    this.state = Rafty.State.FOLLOWER;
                }
                break;
            case "vote":
                // TODO: check total votes if it's ok for SPLIT_VOTE
                this.voteTimer.cancel();
                this.totalVotes++;
                console.log("Votes (recv):", this.votes, this.totalVotes, this.nodes.length);
                if(this.term < data.term) {
                    this.term = data.term - 1;
                    this.state = Rafty.State.SPLIT_VOTE;
                }
                if (this.voted == false) {
                    this.voted = true;
                    node.send(this._messageVoteOK());
                    console.log("[" + this.id + "] Voted for:", node.id);
                } else if(this.totalVotes == this.nodes.length) {
                    console.log("["+this.id+"] SPLIT VOTE", this.votes, this.totalVotes, this.nodes.length);
                    this.state = Rafty.State.SPLIT_VOTE;
                }
                break;
            case "vote_ok":
                // TODO: check total votes if it's ok for SPLIT_VOTE
                this.totalVotes++;
                this.votes++;
                console.log("Votes (ok):", this.votes, this.totalVotes, this.nodes.length);
                if(this.votes >= this.quorum()) {
                    this.leader = this.id;
                } else if(this.totalVotes == this.nodes.length) {
                    console.log("["+this.id+"] SPLIT VOTE", this.votes, this.totalVotes, this.nodes.length);
                    this.state = Rafty.State.SPLIT_VOTE;
                }
                break;
            case "heartbeat":
                this.electionTimer.reset();
                if(this.term <= data.term) {
                    this.term = data.term;
                    this.leader = node.id;
                }
                break;
            default:
                console.error("["+this.id+"] Invalid RPC command! ('"+ data.rpc +"')");
        }
        // console.log("["+this.options.port+"]["+node.peer.id+"]", data);
    }

    onPropertyChanged(event) {
        switch (event.property) {
            case "state":
                // console.log("["+this.id+"] State:", Rafty.State[this.state]);
                if(this.state == Rafty.State.CANDIDATE) {
                    this.term++;
                    if(this.nodes.length > 0) {
                        // send leader election term
                        this.voteTimer.once();
                    } else {
                        this.leader = this.id;
                    }
                    // this.test();
                } else if(this.state == Rafty.State.SPLIT_VOTE) {
                    this.state = Rafty.State.CANDIDATE;
                }
                else if (this.state == Rafty.State.FOLLOWER) {
                    // TODO: make sure we update the snapshot
                    // TODO: maybe we should do this before matching the current term
                    this.electionTimer.once();
                } else if(this.state == Rafty.State.LEADER) {
                    this.heartbeatTimer.indefinite();
                }
                break;
            case "leader":
                this.heartbeatTimer.cancel();
                this.electionTimer.cancel();
                this.voteTimer.cancel();

                if(this.leader == this.id) {
                    this.state = Rafty.State.LEADER;
                    console.log("["+this.id+"] LEADER", this.term);
                } else {
                    this.state = Rafty.State.FOLLOWER;
                    console.log("["+this.id+"] FOLLOWER", this.term);
                }
                break;
            case "term":
                this.voted = false;
                this.votes = 0;
                this.totalVotes = 0;
                console.log("["+this.id+"] Term Changed:", this.term);
                break;
            case "nodes":
                if(event.current) {
                    console.log("Node", event.current.id, "joined!");
                    // just joined
                    event.current.on("data", (data) => {
                        this.receive(event.current, data);
                    });
                    if(this.leader == this.id) {
                        event.current.send(this._messageHeartbeat());
                    }
                }
                if(event.prev) {
                    // just left
                    console.log("Node", event.prev.id, "left!");
                    event.prev.disconnect();
                }
                break;
            default:
                throw new Error("Invalid property change event! '" + event.property + "'")
        }
    }

    quorum() {
        return Math.floor(this.nodes.length / 2) + 1;
    }

    test() {
        console.log("PORT:", this.options.port);
        for(let node of this.nodes) {
            console.log(node.id, node.state);
        }
    }

    _messageHeartbeat() {
        return {
            rpc: "heartbeat",
            term: this.term,
            leader: this.leader
        };
    }

    // TODO: reply with discovery
    _messageDiscoveryReply() {
        return {
            rpc: "discover_reply",
            leader: this.leader,
            term: this.term,
            nodes: []
        };
    }

    _messageVoteForSelf() {
        return {
            rpc: "vote",
            term: this.term,
            id: this.id
        };
    }

    _messageVoteOK() {
        return {
            rpc: "vote_ok"
        };
    }
}

Rafty.State = {
    LEADER: 1,
    FOLLOWER: 2,
    CANDIDATE: 3,
    SPLIT_VOTE: 4, // used for restarting votes
    CONNECTING: 5, // state until fully connected to mesh
    DEAD: -1
};

for(let key in Rafty.State) {
    Rafty.State[Rafty.State[key]] = key;
}

module.exports = Rafty;