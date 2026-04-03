const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")

const PASSWORD = "platforma"

app.use(express.static("public"))

/* === DANE === */
let timers       = {}
let characters   = {}
let tasks        = {}
let resetHour    = 23
let resetMinute  = 59
let customPlaces = []   // [{id, name, yellowSec, greenSec, channels}]
let customTimers = {}   // {"placeId_chN": seconds}
let grotaPings   = {}   // {"pingId": {id, x, y, ch, startedAt}}
let grotaHistory = []   // [{x, y, ts}] — historia wszystkich pingów (do heatmapy)

try{
  const data = JSON.parse(fs.readFileSync("data.json"))
  timers       = data.timers       || {}
  characters   = data.characters   || {}
  tasks        = data.tasks        || {}
  resetHour    = data.resetHour    || 23
  resetMinute  = data.resetMinute  || 59
  customPlaces = data.customPlaces || []
  customTimers = data.customTimers || {}
  grotaPings   = data.grotaPings   || {}
  grotaHistory = data.grotaHistory || []
  // Migracja: jeśli postać ma horseTimer ale brak hasMedal — ustaw hasMedal
  for (const char in characters) {
    if (characters[char].horseTimer && !characters[char].hasMedal) {
      characters[char].hasMedal = true
    }
  }
  console.log("Dane wczytane z data.json")
}catch(e){
  console.log("Brak data.json — start od zera")
}

function saveData(){
  fs.writeFileSync("data.json", JSON.stringify({
    timers, characters, tasks,
    resetHour, resetMinute,
    customPlaces, customTimers, grotaPings, grotaHistory
  }, null, 2))
}

/* === TIMERY GIGANTY/MAŁPY === */
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

/* === CUSTOM TIMERY (liczą w górę jak giganty) === */
let customIntervals = {}

function startCustomTimer(key){
  if(customIntervals[key]) return
  if(!customTimers[key]) customTimers[key]=0
  customIntervals[key]=setInterval(()=>{
    customTimers[key]++
    saveData()
    io.emit("customTimersUpdate", customTimers)
  },1000)
}
function stopCustomTimer(key){
  clearInterval(customIntervals[key])
  customIntervals[key]=null
}
function resetCustomTimer(key){
  customTimers[key]=0
  stopCustomTimer(key)
  saveData()
  io.emit("customTimersUpdate", customTimers)
}

/* === RESET DZIENNY === */
let lastResetDay = null
function checkReset(){
  const now    = new Date()
  const polish = new Date(now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"}))
  const hour   = polish.getHours()
  const minute = polish.getMinutes()
  const day    = polish.toDateString()
  if(hour===resetHour && minute===resetMinute && lastResetDay!==day){
    for(let char in characters){
      let old = characters[char]
      characters[char] = { horseTimer: old.horseTimer || null, hasMedal: old.hasMedal || false, spiritStoneTimer: old.spiritStoneTimer || null, hasStone: old.hasStone || false, bioCurrent: old.bioCurrent || null, bioDoneToday: 0, bioDoneChecked: false, bioDoneTotal: old.bioDoneTotal || 0 }
    }
    lastResetDay = day
    saveData()
    io.emit("charactersUpdate", characters)
  }
}
setInterval(checkReset, 30000)

/* === SOCKET === */
io.on("connection",(socket)=>{

  // Weryfikacja hasła
  socket.on("checkPassword", (pass, cb) => {
    cb(pass === PASSWORD)
  })

  // Giganty / Małpy
  socket.on("start",  id => startTimer(id))
  socket.on("stop",   id => stopTimer(id))
  socket.on("reset",  id => resetTimer(id))

  // Postacie
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
  socket.on("addMedal",(char)=>{
    if(!characters[char]) characters[char]={}
    characters[char].hasMedal = true
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("removeMedal",(char)=>{
    if(!characters[char]) return
    delete characters[char].hasMedal
    delete characters[char].horseTimer
    saveData()
    io.emit("charactersUpdate", characters)
  })

  // Biolog — aktualizacja danych (aktualny przedmiot + oddane)
  socket.on("updateBio",(data)=>{
    const {char, current, doneToday, doneTotal, action} = data
    if(!characters[char]) characters[char]={}
    if(current !== undefined) characters[char].bioCurrent  = current
    if(doneToday !== undefined) characters[char].bioDoneToday = parseInt(doneToday) || 0
    if(doneTotal  !== undefined) characters[char].bioDoneTotal = parseInt(doneTotal)  || 0
    if(action === 'oddaj'){
      characters[char].bioDoneTotal   = (characters[char].bioDoneTotal || 0) + 1
      characters[char].bioDoneChecked = true
    }
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("addStone",(char)=>{
    if(!characters[char]) characters[char]={}
    characters[char].hasStone = true
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("removeStone",(char)=>{
    if(!characters[char]) return
    delete characters[char].hasStone
    delete characters[char].spiritStoneTimer
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("spiritStone",(data)=>{
    const {char, hours} = data
    if(!characters[char]) characters[char]={}
    characters[char].spiritStoneTimer = Date.now() + (hours * 3600 * 1000)
    saveData()
    io.emit("charactersUpdate", characters)
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
      characters[char] = { horseTimer: old.horseTimer || null, hasMedal: old.hasMedal || false, spiritStoneTimer: old.spiritStoneTimer || null, hasStone: old.hasStone || false, bioCurrent: old.bioCurrent || null, bioDoneToday: 0, bioDoneChecked: false, bioDoneTotal: old.bioDoneTotal || 0 }
    }
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // Custom timery
  socket.on("addPlace",(data)=>{
    const {name, yellowSec, greenSec, channels} = data
    if(!name || !greenSec || !channels) return
    if(customPlaces.length >= 10) return
    const id = "p_" + Date.now()
    customPlaces.push({ id, name,
      yellowSec: parseInt(yellowSec) || 0,
      greenSec:  parseInt(greenSec),
      channels:  parseInt(channels)
    })
    saveData()
    io.emit("placesUpdate", customPlaces)
  })

  socket.on("removePlace",(placeId)=>{
    customPlaces = customPlaces.filter(p=>p.id!==placeId)
    for(let key in customTimers){
      if(key.startsWith(placeId+"_")){
        stopCustomTimer(key)
        delete customTimers[key]
      }
    }
    saveData()
    io.emit("placesUpdate", customPlaces)
    io.emit("customTimersUpdate", customTimers)
  })

  socket.on("editPlace",(data)=>{
    const {id, name, yellowSec, greenSec, channels} = data
    const place = customPlaces.find(p=>p.id===id)
    if(!place) return
    const oldCh = place.channels
    place.name      = name
    place.yellowSec = parseInt(yellowSec) || 0
    place.greenSec  = parseInt(greenSec)
    place.channels  = parseInt(channels)
    if(place.channels < oldCh){
      for(let ch=place.channels+1; ch<=oldCh; ch++){
        const key = id+"_ch"+ch
        stopCustomTimer(key)
        delete customTimers[key]
      }
    }
    saveData()
    io.emit("placesUpdate", customPlaces)
    io.emit("customTimersUpdate", customTimers)
  })

  socket.on("startCustom",  key => startCustomTimer(key))
  socket.on("stopCustom",   key => stopCustomTimer(key))
  socket.on("resetCustom",  key => resetCustomTimer(key))

  // Grota Wygnancow - pingi
  socket.on("grotaAddPing", (data) => {
    const id = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2,6)
    grotaPings[id] = { id, x: data.x, y: data.y, ch: data.ch, startedAt: Date.now() }
    grotaHistory.push({ x: data.x, y: data.y, ts: Date.now() })
    if(grotaHistory.length > 2000) grotaHistory = grotaHistory.slice(-2000)
    saveData()
    io.emit("grotaPingsUpdate", grotaPings)
    io.emit("grotaHistoryUpdate", grotaHistory)
  })

  socket.on("grotaRemovePing", (id) => {
    delete grotaPings[id]
    saveData()
    io.emit("grotaPingsUpdate", grotaPings)
  })

  // Wyślij stan do nowego klienta
  socket.emit("update",             timers)
  socket.emit("charactersUpdate",   characters)
  socket.emit("tasksUpdate",        tasks)
  socket.emit("resetTime",          {hour:resetHour, minute:resetMinute})
  socket.emit("placesUpdate",       customPlaces)
  socket.emit("customTimersUpdate", customTimers)
  socket.emit("grotaPingsUpdate",    grotaPings)
  socket.emit("grotaHistoryUpdate", grotaHistory)
})

http.listen(3000,()=>{ console.log("Server działa na porcie 3000") })
