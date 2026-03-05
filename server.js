const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let timers = {};

function initTimers(){

for(let i=1;i<=8;i++){

timers["KG_CH"+i]={start:null,paused:0}
timers["LM_CH"+i]={start:null,paused:0}

}

}

initTimers()

function getTime(t){

if(t.start){

return Math.floor((Date.now()-t.start)/1000)

}else{

return t.paused

}

}

setInterval(()=>{

let output={}

for(let id in timers){

output[id]=getTime(timers[id])

}

io.emit("update",output)

},1000)



io.on("connection",(socket)=>{

let output={}

for(let id in timers){

output[id]=getTime(timers[id])

}

socket.emit("update",output)


socket.on("start",(id)=>{

let t=timers[id]

if(!t.start){

t.start=Date.now()-t.paused*1000

}

})

socket.on("stop",(id)=>{

let t=timers[id]

if(t.start){

t.paused=Math.floor((Date.now()-t.start)/1000)

t.start=null

}

})

socket.on("reset",(id)=>{

timers[id]={start:null,paused:0}

})

})

server.listen(process.env.PORT || 3000)
