const Rafty = require("./libs/Rafty");
const Transport = require("./transport");
const Discovery = require("./discovery");

let args = process.argv.splice(2);
if(args.length != 1) {
    console.log("Usage: node index.js [PORT]");
    return
}

let port = parseInt(args[0]);
let transport = new Transport(port);
let discovery = new Discovery();

let raft = new Rafty();
raft
    .setTransport(transport)
    .setDiscovery(discovery)
    .start();