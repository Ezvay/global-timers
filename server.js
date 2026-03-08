const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)

app.use(express.static("public"))

/* =========================
   TIMERY
========================= */

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

/* =========================
   POSTACIE
========================= */

let characters = {

Medal:{},
Bieluszek:{},
Pojara:{},
Suczka:{},
Czantorianka:{},
EwaZajączkowska:{},
Yodasz:{}

}

/* =========================
   RESET O PÓŁNOCY (POLSKA)
========================= */

let lastReset = null

function checkDailyReset(){

const now = new Date()

const polish = new Date(
now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"})
)

const today = polish.toDateString()

if(lastReset !== today){

characters = {
Medal:{},
Bieluszek:{},
Pojara:{},
Suczka:{},
Czantorianka:{},
EwaZajączkowska:{},
Yodasz:{}
}

lastReset = today

io.emit("charactersUpdate",characters)

}

}

setInterval(checkDailyReset,60000)

/* =========================
   SOCKET
========================= */

io.on("connection",(socket)=>{

/* timery */

socket.on("start",(id)=>startTimer(id))
socket.on("stop",(id)=>stopTimer(id))
socket.on("reset",(id)=>resetTimer(id))

/* checklist */

socket.on("toggleTask",(data)=>{

const {char,task,value}=data

if(!characters[char]) characters[char]={}

characters[char][task]=value

io.emit("charactersUpdate",characters)

})

/* medal konny */

socket.on("horseMedal",(char)=>{

if(!characters[char]) characters[char]={}

characters[char].horseTimer = Date.now() + (23*60*60*1000)

io.emit("charactersUpdate",characters)

})

socket.emit("charactersUpdate",characters)

})

http.listen(3000,()=>{

console.log("Server działa")

})
