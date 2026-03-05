const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

const timers = {}

/* tworzymy timery */

function createTimers(prefix){

for(let i=1;i<=8;i++){

let id = prefix + "_CH" + i

timers[id] = {
time:0,
running:false,
lastStart:0
}

}

}

createTimers("LM")
createTimers("KG")

/* socket */

io.on("connection",(socket)=>{

socket.emit("update",timers)

/* start */

socket.on("start",(id)=>{

let t = timers[id]

if(!t.running){

t.running = true
t.lastStart = Date.now()

}

io.emit("update",timers)

})

/* stop */

socket.on("stop",(id)=>{

let t = timers[id]

if(t.running){

t.time += Math.floor((Date.now()-t.lastStart)/1000)
t.running = false

}

io.emit("update",timers)

})

/* reset */

socket.on("reset",(id)=>{

timers[id] = {
time:0,
running:false,
lastStart:0
}

io.emit("update",timers)

})

})

/* port */

const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{

console.log("Server running on port "+PORT)

})
