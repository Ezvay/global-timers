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
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Logowanie</title>
<style>body{background:#111;color:white;font-family:Arial;text-align:center;margin-top:100px;}
input{padding:8px;font-size:16px;}button{padding:8px 16px;font-size:16px;cursor:pointer;}</style>
</head><body><h2>Strona chroniona hasłem</h2>
<form method="GET"><input type="password" name="password" placeholder="Hasło"><button>Zaloguj</button></form>
</body></html>`)
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
let customPlaces = []   // [ { id, name, respawnSec, channels } ]
let customTimers = {}   // { "place_ch": startTimestamp | null }

try{
  const data = JSON.parse(fs.readFileSync("data.json"))
  timers      = data.timers      || {}
  characters  = data.characters  || {}
  tasks       = data.tasks       || {}
  resetHour   = data.resetHour   || 23
  resetMinute = data.resetMinute || 59
  customPlaces = data.customPlaces || []
  customTimers = data.customTimers || {}
  console.log("Dane wczytane z data.json")
}catch(e){
  console.log("Brak data.json — start od zera")
}

/* ======================
   ZAPIS DANYCH
====================== */

function saveData(){
  fs.writeFileSync("data.json", JSON.stringify({
    timers, characters, tasks,
    resetHour, resetMinute,
    customPlaces, customTimers
  }, null, 2))
}

/* ======================
   TIMERY (Giganty / Małpy)
====================== */

let intervals = {}

function startTimer(id){
  if(intervals[id]) return
  if(!timers[id]) timers[id]=0
  intervals[id]=setInterval(()=>{
    timers[id]++
    saveData()
    io.emit("update", timers)
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
  io.emit("update", timers)
}

/* ======================
   RESET DZIENNY
====================== */

let lastResetDay = null

function checkReset(){
  const now = new Date()
  const polish = new Date(now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"}))
  const hour   = polish.getHours()
  const minute = polish.getMinutes()
  const day    = polish.toDateString()
  if(hour===resetHour && minute===resetMinute && lastResetDay!==day){
    for(let char in characters){
      let old = characters[char]
      characters[char] = { horseTimer: old.horseTimer || null }
    }
    lastResetDay = day
    saveData()
    io.emit("charactersUpdate", characters)
  }
}
setInterval(checkReset, 30000)

/* ======================
   SOCKET
====================== */

io.on("connection",(socket)=>{

  // --- Giganty / Małpy ---
  socket.on("start",  (id)=>startTimer(id))
  socket.on("stop",   (id)=>stopTimer(id))
  socket.on("reset",  (id)=>resetTimer(id))

  // --- Postacie ---
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
    if(!tasks[char].includes(task)) tasks[char].push(task)
    saveData()
    io.emit("tasksUpdate",tasks)
  })

  socket.on("removeTask",(data)=>{
    const {char,task}=data
    if(!tasks[char]) return
    tasks[char] = tasks[char].filter(t=>t!==task)
    if(characters[char]) delete characters[char][task]
    saveData()
    io.emit("tasksUpdate",tasks)
    io.emit("charactersUpdate",characters)
  })

  socket.on("horseMedal",(char)=>{
    if(!characters[char]) characters[char]={}
    characters[char].horseTimer = Date.now() + (23*60*60*1000)
    saveData()
    io.emit("charactersUpdate",characters)
  })

  socket.on("setResetTime",(data)=>{
    resetHour   = data.hour
    resetMinute = data.minute
    saveData()
    io.emit("resetTime",{hour:resetHour,minute:resetMinute})
  })

  socket.on("manualReset",()=>{
    for(let char in characters){
      let old = characters[char]
      characters[char] = { horseTimer: old.horseTimer || null }
    }
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // --- Custom timery ---

  // Dodaj miejsce
  socket.on("addPlace",(data)=>{
    const { name, respawnSec, channels } = data
    if(!name || !respawnSec || !channels) return
    if(customPlaces.length >= 10) return
    const id = "p_" + Date.now()
    customPlaces.push({ id, name, respawnSec: parseInt(respawnSec), channels: parseInt(channels) })
    saveData()
    io.emit("placesUpdate", customPlaces)
    io.emit("customTimersUpdate", customTimers)
  })

  // Usuń miejsce
  socket.on("removePlace",(placeId)=>{
    customPlaces = customPlaces.filter(p=>p.id!==placeId)
    // usuń timery tego miejsca
    for(let key in customTimers){
      if(key.startsWith(placeId+"_")) delete customTimers[key]
    }
    saveData()
    io.emit("placesUpdate", customPlaces)
    io.emit("customTimersUpdate", customTimers)
  })

  // Edytuj miejsce
  socket.on("editPlace",(data)=>{
    const { id, name, respawnSec, channels } = data
    const place = customPlaces.find(p=>p.id===id)
    if(!place) return
    place.name       = name
    place.respawnSec = parseInt(respawnSec)
    // jeśli liczba kanałów się zmniejszyła, usuń nadmiarowe timery
    const oldCh = place.channels
    place.channels   = parseInt(channels)
    if(place.channels < oldCh){
      for(let ch=place.channels+1; ch<=oldCh; ch++){
        delete customTimers[id+"_ch"+ch]
      }
    }
    saveData()
    io.emit("placesUpdate", customPlaces)
    io.emit("customTimersUpdate", customTimers)
  })

  // Start custom timera (zapisuje timestamp startu)
  socket.on("startCustom",(key)=>{
    customTimers[key] = Date.now()
    saveData()
    io.emit("customTimersUpdate", customTimers)
  })

  // Reset custom timera
  socket.on("resetCustom",(key)=>{
    delete customTimers[key]
    saveData()
    io.emit("customTimersUpdate", customTimers)
  })

  // Wyślij stan do nowego klienta
  socket.emit("update",          timers)
  socket.emit("charactersUpdate",characters)
  socket.emit("tasksUpdate",     tasks)
  socket.emit("resetTime",       {hour:resetHour,minute:resetMinute})
  socket.emit("placesUpdate",    customPlaces)
  socket.emit("customTimersUpdate", customTimers)
})

http.listen(3000,()=>{
  console.log("Server działa na porcie 3000")
})
