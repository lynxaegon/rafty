const EventEmitter = require("events");
const NotifyableProperty = require("./NotifyableProperty");
const RaftNode = require("./RaftNode");

class Rafty extends EventEmitter {
    constructor(options) {
        super()
        this.options = Object.assign({
            heartbeat: 5 * 1000,
            electionMin: 200,
            electionMax: 1000
        }, options);

        this.nodes = NotifyableProperty(this, "nodes", [], this.onPropertyChanged.bind(this), {unique: true});
        this.state = NotifyableProperty(this, "state", Rafty.State.DEAD, this.onPropertyChanged.bind(this));
        this.term = NotifyableProperty(this, "term", 0, this.onPropertyChanged.bind(this));
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
        node.setup().then(() => {
            this.nodes.push(node);
        }).catch((e) => {
            console.log("Failed to connect to peer: \""+peer+"\". Reason:", e);
            node.disconnect();
        });
    }

    hasNode(compareFnc) {
        for(let node of this.nodes) {
            if(compareFnc(node)) {
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
        this.state = Rafty.State.FOLLOWER;

        // Auto discover if available
        if(this.discover) {
            this.discover((peers) => {
                for (let peer of peers) {
                    this.join(peer);
                }
            });
        }
    }

    stop() {
        while(this.nodes.length > 0) {
            this.leave(this.nodes[0].peer);
        }
        this.state = Rafty.State.DEAD;
        this.term = -1;
        this.transport = null;
        this.discover = null;
    }

    receive(node, data) {
        if(data.rpc == "discover") {

        }

        console.log("["+this.options.port+"]["+node.peer.id+"]", data);
    }

    onPropertyChanged(event) {
        // console.log(event);
        switch (event.property) {
            case "state":
                break;
            case "term":
                break;
            case "nodes":
                if(event.current) {
                    // just joined
                    event.current.on("data", (data) => {
                        this.receive(event.current, data);
                    });
                }
                if(event.prev) {
                    // just left
                    event.prev.disconnect();
                }
                break;
            default:
                throw new Error("Invalid property change event! '" + event.property + "'")
        }
    }

    test() {
        console.log("PORT:", this.options.port);
        for(let node of this.nodes) {
            console.log(node.peer.id);
        }
    }
}

Rafty.State = {
    LEADER: 1,
    FOLLOWER: 2,
    CANDIDATE: 3,
    DEAD: -1
};

module.exports = Rafty;