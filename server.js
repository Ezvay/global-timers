const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)

app.use(express.static("public"))

/* ======================
   TIMERY
====================== */

let timers = {}
let intervals = {}

function startTimer(id){

if(intervals[id]) return

if(!timers[id]) timers[id]=0

intervals[id]=setInterval(()=>{

timers[id]++

io.emit("update",timers)

},1000)

}

function stopTimer(id){

clearInterval(intervals[id])
intervals[id]=null

}

function resetTimer(id){

timers[id]=0
stopTimer(id)

io.emit("update",timers)

}

/* ======================
   POSTACIE
====================== */

let characters = {

Medal:{},
Bieluszek:{},
Pojara:{},
Suczka:{},
Czantorianka:{},
EwaZajączkowska:{},
Yodasz:{}

}

/* ======================
   RESET GODZINA
====================== */

let resetHour = 0
let resetMinute = 0
let lastResetDay = null

function checkReset(){

const now = new Date()

const polish = new Date(
now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"})
)

const h = polish.getHours()
const m = polish.getMinutes()
const day = polish.toDateString()

if(h===resetHour && m===resetMinute && lastResetDay!==day){

for(let char in characters){

let old = characters[char]

characters[char] = {
horseTimer: old.horseTimer || null
}

}

lastResetDay = day

io.emit("charactersUpdate",characters)

}

}

setInterval(checkReset,60000)

/* ======================
   SOCKET
====================== */

io.on("connection",(socket)=>{

socket.on("start",(id)=>startTimer(id))
socket.on("stop",(id)=>stopTimer(id))
socket.on("reset",(id)=>resetTimer(id))

/* task */

socket.on("toggleTask",(data)=>{

const {char,task,value}=data

if(!characters[char]) characters[char]={}

characters[char][task]=value

io.emit("charactersUpdate",characters)

})

/* medal */

socket.on("horseMedal",(char)=>{

if(!characters[char]) characters[char]={}

characters[char].horseTimer =
Date.now() + (23*60*60*1000)

io.emit("charactersUpdate",characters)

})

/* ustaw reset */

socket.on("setResetTime",(data)=>{

resetHour = data.hour
resetMinute = data.minute

})

/* manual reset */

socket.on("manualReset",()=>{

for(let char in characters){

let old = characters[char]

characters[char] = {
horseTimer: old.horseTimer || null
}

}

io.emit("charactersUpdate",characters)

})

socket.emit("charactersUpdate",characters)

})

http.listen(3000,()=>{

console.log("Server działa")

})
