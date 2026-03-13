const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")

/* ======================
   HASŁO DO CHARACTERS
====================== */

const PASSWORD = "platforma"

app.use((req,res,next)=>{

if(req.path === "/characters.html"){

if(req.query.password !== PASSWORD){

return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Logowanie</title>
<style>
body{
background:#111;
color:white;
font-family:Arial;
text-align:center;
margin-top:100px;
}
input{
padding:8px;
font-size:16px;
}
button{
padding:8px 16px;
font-size:16px;
cursor:pointer;
}
</style>
</head>
<body>

<h2>Strona chroniona hasłem</h2>

<form method="GET">
<input type="password" name="password" placeholder="Hasło">
<button>Zaloguj</button>
</form>

</body>
</html>
`)
}

}

next()

})

app.use(express.static("public"))

/* ======================
   WCZYTANIE DANYCH
====================== */

let timers = {}
let characters = {}
let tasks = {}

let resetHour = 23
let resetMinute = 59

try{

const data = JSON.parse(fs.readFileSync("data.json"))

timers = data.timers || {}
characters = data.characters || {}
tasks = data.tasks || {}

resetHour = data.resetHour || 23
resetMinute = data.resetMinute || 59

console.log("Dane wczytane z data.json")

}catch(e){

console.log("Brak data.json — start od zera")

}

/* ======================
   ZAPIS DANYCH
====================== */

function saveData(){

const data = {
timers,
characters,
tasks,
resetHour,
resetMinute
}

fs.writeFileSync("data.json",JSON.stringify(data,null,2))

}

/* ======================
   TIMERY
====================== */

let intervals = {}

function startTimer(id){

if(intervals[id]) return

if(!timers[id]) timers[id]=0

intervals[id]=setInterval(()=>{

timers[id]++

saveData()

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

saveData()

io.emit("update",timers)

}

/* ======================
   RESET GODZINA
====================== */

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

saveData()

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

saveData()

io.emit("charactersUpdate",characters)

})

socket.on("addTask",(data)=>{

const {char,task}=data

if(!tasks[char]) tasks[char]=[]

tasks[char].push(task)

saveData()

io.emit("tasksUpdate",tasks)

})

socket.on("removeTask",(data)=>{

const {char,task}=data

if(!tasks[char]) return

tasks[char] = tasks[char].filter(t=>t!==task)

delete characters[char][task]

saveData()

io.emit("tasksUpdate",tasks)
io.emit("charactersUpdate",characters)

})

socket.on("horseMedal",(char)=>{

if(!characters[char]) characters[char]={}

characters[char].horseTimer =
Date.now() + (23*60*60*1000)

saveData()

io.emit("charactersUpdate",characters)

})

socket.on("setResetTime",(data)=>{

resetHour = data.hour
resetMinute = data.minute

saveData()

io.emit("resetTime",{hour:resetHour,minute:resetMinute})

})

socket.on("manualReset",()=>{

for(let char in characters){

let old = characters[char]

characters[char] = {
horseTimer: old.horseTimer || null
}

}

saveData()

io.emit("charactersUpdate",characters)

})

socket.emit("update",timers)
socket.emit("charactersUpdate",characters)
socket.emit("tasksUpdate",tasks)
socket.emit("resetTime",{hour:resetHour,minute:resetMinute})

})

http.listen(3000,()=>{

console.log("Server działa")

})
