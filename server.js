const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const fs = require("fs")

const PASSWORD = "platforma"

app.use(express.static("public"))

/* === DANE === */
let timers       = {}
let charOrder    = []   // [charName, ...] — kolejność postaci
let characters   = {}
let tasks        = {}
let resetHour    = 23
let resetMinute  = 59
let customPlaces = []   // [{id, name, yellowSec, greenSec, channels}]
let customTimers = {}   // {"placeId_chN": seconds}
let grotaPings   = {}   // {"pingId": {id, x, y, ch, startedAt}}
let grotaHistory = []   // [{x, y, ts}] — historia wszystkich pingów (do heatmapy)
let grotaGenerals = {}   // {genId: {id, x, y, ch, startedAt}}
let grotaSnapshots = []  // [{id, name, ts, pings, generals}]

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
  charOrder    = data.charOrder    || []
  grotaHistory    = data.grotaHistory    || []
  grotaGenerals   = data.grotaGenerals   || {}
  grotaSnapshots  = data.grotaSnapshots  || []
  // Migracja
  for (const char in characters) {
    const ch = characters[char]
    if (ch.horseTimer && !ch.hasMedal) ch.hasMedal = true
    // stary format kamienia → nowy
    if (ch.hasStone && !ch.stones) {
      const sid = 'stone_legacy'
      ch.stones = { [sid]: { name: 'Kamień Duchowy', timerEnd: ch.spiritStoneTimer || null } }
      delete ch.hasStone
      delete ch.spiritStoneTimer
    }
    if (!ch.stones) ch.stones = {}
  }
  console.log("Dane wczytane z data.json")
}catch(e){
  console.log("Brak data.json — start od zera")
}

function saveData(){
  fs.writeFileSync("data.json", JSON.stringify({
    timers, characters, tasks,
    resetHour, resetMinute,
    customPlaces, customTimers, grotaPings, grotaHistory, charOrder, grotaGenerals, grotaSnapshots
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
      const PROTECTED = new Set(['horseTimer','hasMedal','horseLevel','stones',
        'spiritStoneTimer','hasStone','bioCurrent','bioDoneToday','bioDoneTotal',
        'bioDoneChecked'])
      // Reset: keep protected fields + keep task checkboxes but set them to false
      const fresh = {
        horseTimer:      old.horseTimer || null,
        hasMedal:        old.hasMedal || false,
        horseLevel:      old.horseLevel || 0,
        stones:          old.stones || {},
        bioCurrent:      old.bioCurrent || null,
        bioDoneToday:    0,
        bioDoneChecked:  false,
        bioDoneTotal:    old.bioDoneTotal || 0
      }
      // Reset task checkboxes to false (not delete them)
      for(let key in old){
        if(!PROTECTED.has(key)) fresh[key] = false
      }
      characters[char] = fresh
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
    // Increment horse level on each medal given
    characters[char].horseLevel = (characters[char].horseLevel || 0) + 1
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("addMedal",(data)=>{
    const char  = typeof data === 'string' ? data : data.char
    const level = typeof data === 'object' ? (parseInt(data.level)||0) : 0
    if(!characters[char]) characters[char]={}
    characters[char].hasMedal   = true
    characters[char].horseLevel = level
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
    if(doneTotal  !== undefined) characters[char].bioDoneTotal  = parseInt(doneTotal)  || 0
    if(action === 'oddaj'){
      characters[char].bioDoneTotal   = (characters[char].bioDoneTotal || 0) + 1
      characters[char].bioDoneChecked = true
    }
    saveData()
    io.emit("charactersUpdate", characters)
  })

  // Multi-stone: stones = { stoneId: {name, timerEnd} }
  socket.on("addStone",(data)=>{
    const {char, stoneId, name} = data
    if(!characters[char]) characters[char]={}
    if(!characters[char].stones) characters[char].stones = {}
    characters[char].stones[stoneId] = { name: name||stoneId, timerEnd: null }
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("removeStone",(data)=>{
    const {char, stoneId} = data
    if(!characters[char]?.stones) return
    delete characters[char].stones[stoneId]
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("renameStone",(data)=>{
    const {char, stoneId, name} = data
    if(!characters[char]?.stones?.[stoneId]) return
    characters[char].stones[stoneId].name = name
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("spiritStone",(data)=>{
    const {char, stoneId, hours} = data
    if(!characters[char]?.stones?.[stoneId]) return
    characters[char].stones[stoneId].timerEnd = Date.now() + (hours * 3600 * 1000)
    saveData()
    io.emit("charactersUpdate", characters)
  })

  socket.on("setHorseLevel",(data)=>{
    const {char, level} = data
    if(!characters[char]) characters[char]={}
    characters[char].horseLevel = parseInt(level)||0
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
      const PROTECTED = new Set(['horseTimer','hasMedal','horseLevel','stones',
        'spiritStoneTimer','hasStone','bioCurrent','bioDoneToday','bioDoneTotal',
        'bioDoneChecked'])
      const fresh = {
        horseTimer:      old.horseTimer || null,
        hasMedal:        old.hasMedal || false,
        horseLevel:      old.horseLevel || 0,
        stones:          old.stones || {},
        bioCurrent:      old.bioCurrent || null,
        bioDoneToday:    0,
        bioDoneChecked:  false,
        bioDoneTotal:    old.bioDoneTotal || 0
      }
      for(let key in old){ if(!PROTECTED.has(key)) fresh[key] = false }
      characters[char] = fresh
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

  socket.on("setCharOrder",(order)=>{
    charOrder = order
    saveData()
    io.emit("charOrderUpdate", charOrder)
  })

  // Generałowie
  socket.on("grotaAddGeneral",(data)=>{
    const id = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2,6)
    grotaGenerals[id] = { id, x: data.x, y: data.y, ch: data.ch, startedAt: Date.now() }
    saveData()
    io.emit("grotaGeneralsUpdate", grotaGenerals)
  })
  socket.on("grotaRemoveGeneral",(id)=>{
    delete grotaGenerals[id]
    saveData()
    io.emit("grotaGeneralsUpdate", grotaGenerals)
  })

  // Snapshoty
  socket.on("grotaSaveSnapshot",(data)=>{
    const snap = {
      id:   "snap_" + Date.now(),
      name: data.name || "Snapshot",
      ts:   Date.now(),
      pings:    JSON.parse(JSON.stringify(grotaPings)),
      generals: JSON.parse(JSON.stringify(grotaGenerals))
    }
    grotaSnapshots.unshift(snap)
    if(grotaSnapshots.length > 10) grotaSnapshots = grotaSnapshots.slice(0,10)
    saveData()
    io.emit("grotaSnapshotsUpdate", grotaSnapshots)
  })
  socket.on("grotaLoadSnapshot",(snapId)=>{
    const snap = grotaSnapshots.find(s=>s.id===snapId)
    if(!snap) return
    // Restore pings and generals from snapshot
    grotaPings    = JSON.parse(JSON.stringify(snap.pings))
    grotaGenerals = JSON.parse(JSON.stringify(snap.generals))
    saveData()
    io.emit("grotaPingsUpdate",    grotaPings)
    io.emit("grotaGeneralsUpdate", grotaGenerals)
  })
  socket.on("grotaDeleteSnapshot",(snapId)=>{
    grotaSnapshots = grotaSnapshots.filter(s=>s.id!==snapId)
    saveData()
    io.emit("grotaSnapshotsUpdate", grotaSnapshots)
  })

  // Wyślij stan do nowego klienta
  socket.emit("update",             timers)
  socket.emit("tasksUpdate",        tasks)
  socket.emit("charactersUpdate",   characters)
  socket.emit("resetTime",          {hour:resetHour, minute:resetMinute})
  socket.emit("placesUpdate",       customPlaces)
  socket.emit("customTimersUpdate", customTimers)
  socket.emit("grotaPingsUpdate",    grotaPings)
  socket.emit("grotaHistoryUpdate",  grotaHistory)
  socket.emit("grotaGeneralsUpdate", grotaGenerals)
  socket.emit("grotaSnapshotsUpdate", grotaSnapshots)
  socket.emit("charOrderUpdate",    charOrder)
})


http.listen(3000,()=>{ console.log("Server działa na porcie 3000") })
