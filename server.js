const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let timers = {};

for (let i = 1; i <= 8; i++) {
 timers["CH"+i] = { time:0, running:false };
}

setInterval(()=>{

 for(let id in timers){
  if(timers[id].running){
   timers[id].time++;
  }
 }

 io.emit("update", timers);

},1000);


io.on("connection",(socket)=>{

 socket.emit("update", timers);

 socket.on("start",(id)=>{
  timers[id].running = true;
 });

 socket.on("stop",(id)=>{
  timers[id].running = false;
 });

 socket.on("reset",(id)=>{
  timers[id].running = false;
  timers[id].time = 0;
 });

});

server.listen(process.env.PORT || 3000);
