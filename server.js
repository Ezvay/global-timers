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

let resetHour = 23
let resetMinute = 59
let lastResetDay = null

function checkReset(){

const now = new Date()

const polish = new Date(
now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"})
)

const hour = polish.getHours()
const minute = polish.getMinutes()
const day = polish.toDateString()

if(hour === resetHour && minute === resetMinute && lastResetDay !== day){

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

setInterval(checkReset,30000)

/* ======================
   SOCKET
====================== */

io.on("connection",(socket)=>{

socket.on("start",(id)=>startTimer(id))
socket.on("stop",(id)=>stopTimer(id))
socket.on("reset",(id)=>resetTimer(id))

socket.on("toggleTask",(data)=>{

const {char,task,value}=data

if(!characters[char]) characters[char]={}

characters[char][task]=value

io.emit("charactersUpdate",characters)

})

socket.on("horseMedal",(char)=>{

if(!characters[char]) characters[char]={}

characters[char].horseTimer =
Date.now() + (23*60*60*1000)

io.emit("charactersUpdate",characters)

})

socket.on("setResetTime",(data)=>{

resetHour = data.hour
resetMinute = data.minute

io.emit("resetTime",{hour:resetHour,minute:resetMinute})

})

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
socket.emit("resetTime",{hour:resetHour,minute:resetMinute})

})

http.listen(3000,()=>{

console.log("Server działa")

})
