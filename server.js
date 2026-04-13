const express    = require("express")
const app        = express()
const http       = require("http").createServer(app)
const io         = require("socket.io")(http)
const { MongoClient } = require("mongodb")

/* ======================
   KONFIGURACJA
====================== */

const PASSWORD  = "platforma"
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://kawulokdarek8_db_user:platforma@cluster0.kdommpz.mongodb.net/global_timers?retryWrites=true&w=majority&appName=Cluster0"
const DB_NAME   = "global_timers"
const COL_NAME  = "state"
const DOC_ID    = "main"

/* Hasło sprawdzane przez Socket.io — brak blokady URL */

app.use(express.static("public"))

// Proxy ikonek z wiki Metin2
const https = require("https")
app.get("/wiki-icon/:filename", (req, res) => {
  const filename = req.params.filename
  const url = `https://pl-wiki.metin2.gameforge.com/index.php/Specjalna:Redirect/file/${filename}`
  const request = https.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 5000
  }, response => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      // Podąża za redirectem
      const redirectUrl = response.headers.location
      if (!redirectUrl) return res.status(404).end()
      https.get(redirectUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, r2 => {
        res.setHeader("Content-Type", r2.headers["content-type"] || "image/png")
        res.setHeader("Cache-Control", "public, max-age=86400")
        r2.pipe(res)
      }).on("error", () => res.status(404).end())
    } else if (response.statusCode === 200) {
      res.setHeader("Content-Type", response.headers["content-type"] || "image/png")
      res.setHeader("Cache-Control", "public, max-age=86400")
      response.pipe(res)
    } else {
      res.status(404).end()
    }
  })
  request.on("error", () => res.status(404).end())
  request.on("timeout", () => { request.destroy(); res.status(504).end() })
})

/* ======================
   STAN W PAMIĘCI
====================== */

let timers        = {}
let characters    = {}
let charsList     = {}   // {name: iconPath}
let skarbiec      = { inwestycje: {}, udzialy: {}, sprzedaz: [], zakupy: [] }
let runningTimers       = new Set()  // które timery były uruchomione
let runningCustomTimers = new Set()  // które custom timery były uruchomione
let tasks         = {}
let resetHour     = 23
let resetMinute   = 59
let customPlaces  = []
let customTimers  = {}
let grotaPings    = {}
let grotaHistory  = []
let grotaGenerals = {}
let grotaSnapshots= []
let grotaDeadHistory = []  // historia zbitych metinów z timerami
let swiatyniaPings={}, swiatyniaHistory=[], swiatyniaGenerals={}, swiatyniaSnapshots=[], swiatyniaDeadHistory=[]
let lasPings={}, lasHistory=[], lasGenerals={}, lasSnapshots=[], lasDeadHistory=[]
let pustyniaPings={}, pustyniaHistory=[], pustyniaGenerals={}, pustyniaSnapshots=[], pustyniaDeadHistory=[]
let dolinaPings={}, dolinaHistory=[], dolinaGenerals={}, dolinaSnapshots=[], dolinaDeadHistory=[]
let redlasPings={}, redlasHistory=[], redlasGenerals={}, redlasSnapshots=[], redlasDeadHistory=[]
let sohanPings={}, sohanHistory=[], sohanGenerals={}, sohanSnapshots=[], sohanDeadHistory=[]
let charOrder     = []

/* ======================
   MONGODB
====================== */

let db, col

async function connectDB() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  db  = client.db(DB_NAME)
  col = db.collection(COL_NAME)
  console.log("Połączono z MongoDB")

  // Wczytaj stan
  const doc = await col.findOne({ _id: DOC_ID })
  if (doc) {
    timers         = doc.timers         || {}
    characters     = doc.characters     || {}
    tasks          = doc.tasks          || {}
    resetHour      = doc.resetHour      ?? 23
    resetMinute    = doc.resetMinute    ?? 59
    customPlaces   = doc.customPlaces   || []
    customTimers   = doc.customTimers   || {}
    grotaPings     = doc.grotaPings     || {}
    grotaHistory   = doc.grotaHistory   || []
    grotaGenerals  = doc.grotaGenerals  || {}
    grotaSnapshots = doc.grotaSnapshots || []
    // Wczytaj dead history, odfiltruj wygasłe (>35min)
    grotaDeadHistory = (doc.grotaDeadHistory || []).filter(d => Date.now() - d.killedAt < 35*60*1000)
    swiatyniaPings=doc.swiatyniaPings||{};swiatyniaHistory=doc.swiatyniaHistory||[];swiatyniaGenerals=doc.swiatyniaGenerals||{};swiatyniaSnapshots=doc.swiatyniaSnapshots||[];swiatyniaDeadHistory=(doc.swiatyniaDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    lasPings=doc.lasPings||{};lasHistory=doc.lasHistory||[];lasGenerals=doc.lasGenerals||{};lasSnapshots=doc.lasSnapshots||[];lasDeadHistory=(doc.lasDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    pustyniaPings=doc.pustyniaPings||{};pustyniaHistory=doc.pustyniaHistory||[];pustyniaGenerals=doc.pustyniaGenerals||{};pustyniaSnapshots=doc.pustyniaSnapshots||[];pustyniaDeadHistory=(doc.pustyniaDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    dolinaPings=doc.dolinaPings||{};dolinaHistory=doc.dolinaHistory||[];dolinaGenerals=doc.dolinaGenerals||{};dolinaSnapshots=doc.dolinaSnapshots||[];dolinaDeadHistory=(doc.dolinaDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    redlasPings=doc.redlasPings||{};redlasHistory=doc.redlasHistory||[];redlasGenerals=doc.redlasGenerals||{};redlasSnapshots=doc.redlasSnapshots||[];redlasDeadHistory=(doc.redlasDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    sohanPings=doc.sohanPings||{};sohanHistory=doc.sohanHistory||[];sohanGenerals=doc.sohanGenerals||{};sohanSnapshots=doc.sohanSnapshots||[];sohanDeadHistory=(doc.sohanDeadHistory||[]).filter(d=>Date.now()-d.killedAt<35*60*1000)
    charOrder           = doc.charOrder           || []
  charsList           = doc.charsList           || {}
  skarbiec            = doc.skarbiec            || { inwestycje: {}, udzialy: {}, sprzedaz: [], zakupy: [] }
  if (!skarbiec.udzialy)  skarbiec.udzialy  = {}
  if (!skarbiec.zakupy)   skarbiec.zakupy   = []
    runningTimers       = new Set(doc.runningTimers       || [])
    runningCustomTimers = new Set(doc.runningCustomTimers || [])

    // Migracja charsList — zawsze uzupełniaj brakujące postacie
    const defaultIcons = {
      Medal: '/icons/warrior.png', Bieluszek: '/icons/ninja.png',
      Pojara: '/icons/shaman.png', Suczka: '/icons/shaman.png',
      Czantorianka: '/icons/shaman.png', EwaZajączkowska: '/icons/warriorw.png',
      Yodasz: '/icons/sura.png'
    }
    // Dodaj do charsList wszystkich z characters których tam nie ma
    for (const char in characters) {
      if (!charsList[char]) charsList[char] = defaultIcons[char] || '/icons/warrior.png'
    }
    // Dodaj do charsList wszystkich z tasks których tam nie ma
    for (const char in tasks) {
      if (!charsList[char]) charsList[char] = defaultIcons[char] || '/icons/warrior.png'
    }

    // Migracja
    for (const char in characters) {
      const ch = characters[char]
      if (ch.horseTimer && !ch.hasMedal) ch.hasMedal = true
      if (ch.hasStone && !ch.stones) {
        ch.stones = { stone_legacy: { name: 'Kamień Duchowy', timerEnd: ch.spiritStoneTimer || null } }
        delete ch.hasStone
        delete ch.spiritStoneTimer
      }
      if (!ch.stones) ch.stones = {}
    }
    // Nadrabiaj czas który minął podczas restartu
    if (doc.shutdownAt && doc.runningTimers && doc.runningTimers.length > 0) {
      const elapsed = Math.floor((Date.now() - doc.shutdownAt) / 1000)
      if (elapsed > 0 && elapsed < 3600) { // max 1h nadrabiania
        for (const id of doc.runningTimers) {
          if (timers[id] !== undefined) timers[id] += elapsed
        }
        for (const key of (doc.runningCustomTimers || [])) {
          if (customTimers[key] !== undefined) customTimers[key] += elapsed
        }
        console.log("Nadrobiono " + elapsed + "s przestoju")
      }
    }
    console.log("Dane wczytane z MongoDB")
  } else {
    console.log("Brak dokumentu — start od zera")
  }
}

// Debounced save — nie zapisuj częściej niż co 2s
let saveTimer = null
async function saveNow() {
  if (!col) return
  try {
    await col.replaceOne(
      { _id: DOC_ID },
      { _id: DOC_ID, timers, characters, tasks, resetHour, resetMinute,
        customPlaces, customTimers, grotaPings, grotaHistory,
        grotaGenerals, grotaSnapshots, grotaDeadHistory, charOrder, charsList, skarbiec,
        swiatyniaPings,swiatyniaHistory,swiatyniaGenerals,swiatyniaSnapshots,swiatyniaDeadHistory,
        lasPings,lasHistory,lasGenerals,lasSnapshots,lasDeadHistory,
        pustyniaPings,pustyniaHistory,pustyniaGenerals,pustyniaSnapshots,pustyniaDeadHistory,
        dolinaPings,dolinaHistory,dolinaGenerals,dolinaSnapshots,dolinaDeadHistory,
        redlasPings,redlasHistory,redlasGenerals,redlasSnapshots,redlasDeadHistory,
        sohanPings,sohanHistory,sohanGenerals,sohanSnapshots,sohanDeadHistory,
        runningTimers: [...runningTimers],
        runningCustomTimers: [...runningCustomTimers] },
      { upsert: true }
    )
  } catch(e) {
    console.error("Błąd zapisu:", e.message)
  }
}

function saveData() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 500)
}

/* ======================
   TIMERY (Giganty/Małpy)
====================== */

let intervals = {}

function startTimer(id){
  if(intervals[id]) return
  if(!timers[id]) timers[id]=0
  runningTimers.add(id)
  intervals[id]=setInterval(()=>{
    timers[id]++
    saveData()
    io.emit("update", timers)
  },1000)
}
function stopTimer(id){
  clearInterval(intervals[id])
  intervals[id]=null
  runningTimers.delete(id)
  saveData()
}
function resetTimer(id){
  timers[id]=0
  stopTimer(id)
  saveData()
  io.emit("update", timers)
}

/* ======================
   CUSTOM TIMERY
====================== */

let customIntervals = {}

function startCustomTimer(key){
  if(customIntervals[key]) return
  if(!customTimers[key]) customTimers[key]=0
  runningCustomTimers.add(key)
  customIntervals[key]=setInterval(()=>{
    customTimers[key]++
    saveData()
    io.emit("customTimersUpdate", customTimers)
  },1000)
}
function stopCustomTimer(key){
  clearInterval(customIntervals[key])
  customIntervals[key]=null
  runningCustomTimers.delete(key)
  saveData()
}
function resetCustomTimer(key){
  customTimers[key]=0
  stopCustomTimer(key)
  saveData()
  io.emit("customTimersUpdate", customTimers)
}

/* ======================
   RESET DZIENNY
====================== */

const PROTECTED_KEYS = new Set(['horseTimer','hasMedal','horseLevel','stones',
  'spiritStoneTimer','hasStone','bioCurrent','bioDoneToday','bioDoneTotal','bioDoneChecked'])

let lastResetDay = null

function checkReset(){
  const now    = new Date()
  const polish = new Date(now.toLocaleString("en-US",{timeZone:"Europe/Warsaw"}))
  const hour   = polish.getHours()
  const minute = polish.getMinutes()
  const day    = polish.toDateString()
  if(hour===resetHour && minute===resetMinute && lastResetDay!==day){
    for(let char in characters){
      const old   = characters[char]
      const fresh = {
        horseTimer:     old.horseTimer     || null,
        hasMedal:       old.hasMedal       || false,
        horseLevel:     old.horseLevel     || 0,
        stones:         old.stones         || {},
        bioCurrent:     old.bioCurrent     || null,
        bioDoneToday:   0,
        bioDoneChecked: false,
        bioTriedToday:  false,
        medalGivenToday: false,
        bioDoneTotal:   old.bioDoneTotal   || 0
      }
      for(let key in old){ if(!PROTECTED_KEYS.has(key)) fresh[key] = false }
      characters[char] = fresh
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

  // Weryfikacja hasła
  socket.on("checkPassword",(pass,cb)=>{ cb(pass===PASSWORD) })

  // Giganty / Małpy
  socket.on("start",  id => startTimer(id))
  socket.on("stop",   id => stopTimer(id))
  socket.on("reset",  id => resetTimer(id))

  // Postacie — zadania
  socket.on("toggleTask",(data)=>{
    const {char,task,value}=data
    if(!characters[char]) characters[char]={}
    characters[char][task]=value
    saveNow()  // natychmiastowy zapis — checkbox jest krytyczny
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
    tasks[char]=tasks[char].filter(t=>t!==task)
    if(characters[char]) delete characters[char][task]
    saveData()
    io.emit("tasksUpdate",tasks)
    io.emit("charactersUpdate",characters)
  })

  // Medal
  socket.on("horseMedal",(char)=>{
    if(!characters[char]) characters[char]={}
    characters[char].horseTimer  = Date.now() + (23*60*60*1000)
    characters[char].horseLevel  = (characters[char].horseLevel||0) + 1
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("addMedal",(data)=>{
    const char  = typeof data==='string' ? data : data.char
    const level = typeof data==='object' ? (parseInt(data.level)||0) : 0
    if(!characters[char]) characters[char]={}
    characters[char].hasMedal   = true
    characters[char].horseLevel = level
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("removeMedal",(char)=>{
    if(!characters[char]) return
    delete characters[char].hasMedal
    delete characters[char].horseTimer
    delete characters[char].horseLevel
    delete characters[char].medalGivenToday
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("setHorseLevel",(data)=>{
    const {char,level}=data
    if(!characters[char]) characters[char]={}
    characters[char].horseLevel=parseInt(level)||0
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // Kamień duchowy
  socket.on("addStone",(data)=>{
    const {char,stoneId,name}=data
    if(!characters[char]) characters[char]={}
    if(!characters[char].stones) characters[char].stones={}
    characters[char].stones[stoneId]={name:name||stoneId,timerEnd:null}
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("removeStone",(data)=>{
    const {char,stoneId}=data
    if(!characters[char]?.stones) return
    delete characters[char].stones[stoneId]
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("renameStone",(data)=>{
    const {char,stoneId,name}=data
    if(!characters[char]?.stones?.[stoneId]) return
    characters[char].stones[stoneId].name=name
    saveData()
    io.emit("charactersUpdate",characters)
  })
  socket.on("spiritStone",(data)=>{
    const {char,stoneId,hours}=data
    if(!characters[char]?.stones?.[stoneId]) return
    characters[char].stones[stoneId].timerEnd=Date.now()+(hours*3600*1000)
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // Biolog
  socket.on("updateBio",(data)=>{
    const {char,current,doneToday,doneTotal,action,remove}=data
    if(!characters[char]) characters[char]={}
    if(current   !== undefined) characters[char].bioCurrent     = current
    if(doneToday !== undefined) characters[char].bioDoneToday   = parseInt(doneToday)||0
    if(doneTotal !== undefined) characters[char].bioDoneTotal   = parseInt(doneTotal)||0
    if(remove) {
      characters[char].bioCurrent     = null
      characters[char].bioDoneToday   = 0
      characters[char].bioDoneTotal   = 0
      characters[char].bioDoneChecked = false
    }
    if(action==='oddaj'){
      characters[char].bioDoneTotal   = (characters[char].bioDoneTotal||0)+1
      characters[char].bioDoneChecked = true
    }
    if(action==='oddaj_nie'){
      // Niepomyślne — zablokuj przycisk ale NIE dodawaj do licznika ani nie zaznaczaj jako oddane
      characters[char].bioTriedToday = true
    }
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // Reset
  socket.on("setResetTime",(data)=>{
    resetHour   = data.hour
    resetMinute = data.minute
    saveData()
    io.emit("resetTime",{hour:resetHour,minute:resetMinute})
  })
  socket.on("manualReset",()=>{
    for(let char in characters){
      const old   = characters[char]
      const fresh = {
        horseTimer:     old.horseTimer     || null,
        hasMedal:       old.hasMedal       || false,
        horseLevel:     old.horseLevel     || 0,
        stones:         old.stones         || {},
        bioCurrent:     old.bioCurrent     || null,
        bioDoneToday:   0,
        bioDoneChecked: false,
        bioTriedToday:  false,
        medalGivenToday: false,
        bioDoneTotal:   old.bioDoneTotal   || 0
      }
      for(let key in old){ if(!PROTECTED_KEYS.has(key)) fresh[key] = false }
      characters[char] = fresh
    }
    saveData()
    io.emit("charactersUpdate",characters)
  })

  // Kolejność postaci
  // Skarbiec
  socket.on("skarbiecSetInwestycja",(data)=>{
    const {nick, kwota} = data
    if(!skarbiec.inwestycje) skarbiec.inwestycje = {}
    skarbiec.inwestycje[nick] = parseFloat(kwota)||0
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecSetUdzial",(data)=>{
    const {nick, udzial} = data
    if(!skarbiec.udzialy) skarbiec.udzialy = {}
    skarbiec.udzialy[nick] = parseFloat(udzial)||1
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecAddNick",(nick)=>{
    if(!skarbiec.inwestycje) skarbiec.inwestycje = {}
    if(skarbiec.inwestycje[nick]===undefined) skarbiec.inwestycje[nick] = 0
    if(!skarbiec.udzialy) skarbiec.udzialy = {}
    if(skarbiec.udzialy[nick]===undefined) skarbiec.udzialy[nick] = 1
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecRemoveNick",(nick)=>{
    if(skarbiec.inwestycje) delete skarbiec.inwestycje[nick]
    if(skarbiec.udzialy)    delete skarbiec.udzialy[nick]
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecAddSprzedaz",(data)=>{
    const {opis, kwota, imgUrl} = data
    if(!skarbiec.sprzedaz) skarbiec.sprzedaz = []
    skarbiec.sprzedaz.unshift({ id:'sp_'+Date.now(), opis, kwota:parseFloat(kwota)||0, imgUrl:imgUrl||'', ts:Date.now() })
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecRemoveSprzedaz",(id)=>{
    skarbiec.sprzedaz = (skarbiec.sprzedaz||[]).filter(s=>s.id!==id)
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecAddZakup",(data)=>{
    const {opis, kwota, kto, imgUrl} = data
    if(!skarbiec.zakupy) skarbiec.zakupy = []
    skarbiec.zakupy.unshift({ id:'buy_'+Date.now(), opis, kwota:parseFloat(kwota)||0, kto:kto||'', imgUrl:imgUrl||'', ts:Date.now() })
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })
  socket.on("skarbiecRemoveZakup",(id)=>{
    skarbiec.zakupy = (skarbiec.zakupy||[]).filter(b=>b.id!==id)
    saveNow(); io.emit("skarbiecUpdate", skarbiec)
  })

  socket.on("setCharOrder",(order)=>{
    charOrder=order
    saveData()
    io.emit("charOrderUpdate",charOrder)
  })

  socket.on("addChar",(data)=>{
    const {name, icon} = data
    if(!name || charsList[name]) return
    charsList[name] = icon || '/icons/warrior.png'
    if(!characters[name]) characters[name] = { stones: {} }
    if(!tasks[name]) tasks[name] = []
    saveData()
    io.emit("charsListUpdate", charsList)
    io.emit("tasksUpdate", tasks)
    io.emit("charactersUpdate", characters)
  })

  socket.on("removeChar",(name)=>{
    delete charsList[name]
    delete characters[name]
    delete tasks[name]
    charOrder = charOrder.filter(n => n !== name)
    saveData()
    io.emit("charsListUpdate", charsList)
    io.emit("charOrderUpdate", charOrder)
  })

  socket.on("setMedalGivenToday",(data)=>{
    const {char, given} = data
    if(!characters[char]) characters[char]={}
    characters[char].medalGivenToday = given
    saveData()
    io.emit("charactersUpdate", characters)
  })

  // Custom timery (Własne Timery)
  socket.on("addPlace",(data)=>{
    const {name,yellowSec,greenSec,channels}=data
    if(!name||!greenSec||!channels) return
    if(customPlaces.length>=10) return
    const id="p_"+Date.now()
    customPlaces.push({id,name,yellowSec:parseInt(yellowSec)||0,greenSec:parseInt(greenSec),channels:parseInt(channels)})
    saveData()
    io.emit("placesUpdate",customPlaces)
  })
  socket.on("removePlace",(placeId)=>{
    customPlaces=customPlaces.filter(p=>p.id!==placeId)
    for(let key in customTimers){
      if(key.startsWith(placeId+"_")){stopCustomTimer(key);delete customTimers[key]}
    }
    saveData()
    io.emit("placesUpdate",customPlaces)
    io.emit("customTimersUpdate",customTimers)
  })
  socket.on("editPlace",(data)=>{
    const {id,name,yellowSec,greenSec,channels}=data
    const place=customPlaces.find(p=>p.id===id)
    if(!place) return
    const oldCh=place.channels
    place.name=name; place.yellowSec=parseInt(yellowSec)||0
    place.greenSec=parseInt(greenSec); place.channels=parseInt(channels)
    if(place.channels<oldCh){
      for(let ch=place.channels+1;ch<=oldCh;ch++){
        const key=id+"_ch"+ch; stopCustomTimer(key); delete customTimers[key]
      }
    }
    saveData()
    io.emit("placesUpdate",customPlaces)
    io.emit("customTimersUpdate",customTimers)
  })
  socket.on("startCustom",  key => startCustomTimer(key))
  socket.on("stopCustom",   key => stopCustomTimer(key))
  socket.on("resetCustom",  key => resetCustomTimer(key))

  // Grota — metiny
  socket.on("grotaAddPing",(data)=>{
    const id="g_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)
    grotaPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}
    grotaHistory.push({x:data.x,y:data.y,ts:Date.now()})
    if(grotaHistory.length>2000) grotaHistory=grotaHistory.slice(-2000)
    saveData()
    io.emit("grotaPingsUpdate",grotaPings)
    io.emit("grotaHistoryUpdate",grotaHistory)
  })
  // Dead history handlers
  socket.on("grotaAddDead", (dead) => {
    if (!dead || !dead.id) return
    grotaDeadHistory.push(dead)
    // Usuń wygasłe
    grotaDeadHistory = grotaDeadHistory.filter(d => Date.now() - d.killedAt < 35*60*1000)
    io.emit("grotaDeadHistoryUpdate", grotaDeadHistory)
    saveData()
  })

  socket.on("grotaRemoveDead", (id) => {
    grotaDeadHistory = grotaDeadHistory.filter(d => d.id !== id)
    io.emit("grotaDeadHistoryUpdate", grotaDeadHistory)
    saveData()
  })

  socket.on("grotaResetHistory", () => {
    grotaHistory = []
    io.emit("grotaHistoryUpdate", grotaHistory)
    saveData()
  })

  socket.on("grotaClearSnapshots", () => {
    grotaSnapshots = []
    io.emit("grotaSnapshotsUpdate", grotaSnapshots)
    saveData()
  })

  socket.on("grotaRemovePing",(id)=>{
    delete grotaPings[id]
    saveData()
    io.emit("grotaPingsUpdate",grotaPings)
  })

  // Grota — generałowie
  socket.on("grotaAddGeneral",(data)=>{
    const id="g_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)
    grotaGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}
    saveData()
    io.emit("grotaGeneralsUpdate",grotaGenerals)
  })
  socket.on("grotaRemoveGeneral",(id)=>{
    delete grotaGenerals[id]
    saveData()
    io.emit("grotaGeneralsUpdate",grotaGenerals)
  })

  // Grota — snapshoty
  socket.on("grotaSaveSnapshot",(data)=>{
    const snap={
      id:"snap_"+Date.now(),
      name:data.name||"Snapshot",
      ts:Date.now(),
      pings:    JSON.parse(JSON.stringify(grotaPings)),
      generals: JSON.parse(JSON.stringify(grotaGenerals))
    }
    grotaSnapshots.unshift(snap)
    if(grotaSnapshots.length>10) grotaSnapshots=grotaSnapshots.slice(0,10)
    saveData()
    io.emit("grotaSnapshotsUpdate",grotaSnapshots)
  })
  socket.on("grotaLoadSnapshot",(snapId)=>{
    const snap=grotaSnapshots.find(s=>s.id===snapId)
    if(!snap) return
    grotaPings    = JSON.parse(JSON.stringify(snap.pings))
    grotaGenerals = JSON.parse(JSON.stringify(snap.generals))
    saveData()
    io.emit("grotaPingsUpdate",grotaPings)
    io.emit("grotaGeneralsUpdate",grotaGenerals)
  })
  socket.on("grotaDeleteSnapshot",(snapId)=>{
    grotaSnapshots=grotaSnapshots.filter(s=>s.id!==snapId)
    saveData()
    io.emit("grotaSnapshotsUpdate",grotaSnapshots)
  })

  // Wyślij stan do nowego klienta
  socket.emit("update",              timers)
  // charsListUpdate MUSI być pierwsza — buduje karty postaci
  socket.emit("charsListUpdate",     charsList)
  socket.emit("skarbiecUpdate",       skarbiec)
  socket.emit("charOrderUpdate",     charOrder)
  socket.emit("tasksUpdate",         tasks)
  socket.emit("charactersUpdate",    characters)
  socket.emit("resetTime",           {hour:resetHour,minute:resetMinute})
  socket.emit("placesUpdate",        customPlaces)
  socket.emit("customTimersUpdate",  customTimers)
  socket.emit("grotaPingsUpdate",    grotaPings)
  socket.emit("grotaHistoryUpdate",  grotaHistory)
  socket.emit("grotaGeneralsUpdate", grotaGenerals)
  socket.emit("grotaSnapshotsUpdate",grotaSnapshots)
  // Wyślij dead history (odfiltruj wygasłe)
  grotaDeadHistory = grotaDeadHistory.filter(d => Date.now() - d.killedAt < 35*60*1000)
  socket.emit("grotaDeadHistoryUpdate", grotaDeadHistory)
  // === swiatynia ===
  socket.on('swiatyniaAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); swiatyniaPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; swiatyniaHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(swiatyniaHistory.length>2000) swiatyniaHistory=swiatyniaHistory.slice(-2000); io.emit('swiatyniaPingsUpdate',swiatyniaPings); io.emit('swiatyniaHistoryUpdate',swiatyniaHistory); saveData() })
  socket.on('swiatyniaRemovePing',(id)=>{ delete swiatyniaPings[id]; io.emit('swiatyniaPingsUpdate',swiatyniaPings); saveData() })
  socket.on('swiatyniaAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); swiatyniaGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('swiatyniaGeneralsUpdate',swiatyniaGenerals); saveData() })
  socket.on('swiatyniaRemoveGeneral',(id)=>{ delete swiatyniaGenerals[id]; io.emit('swiatyniaGeneralsUpdate',swiatyniaGenerals); saveData() })
  socket.on('swiatyniaAddDead',(dead)=>{ if(!dead||!dead.id) return; swiatyniaDeadHistory.push(dead); swiatyniaDeadHistory=swiatyniaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('swiatyniaDeadHistoryUpdate',swiatyniaDeadHistory); saveData() })
  socket.on('swiatyniaRemoveDead',(id)=>{ swiatyniaDeadHistory=swiatyniaDeadHistory.filter(d=>d.id!==id); io.emit('swiatyniaDeadHistoryUpdate',swiatyniaDeadHistory); saveData() })
  socket.on('swiatyniaResetHistory',()=>{ swiatyniaHistory=[]; io.emit('swiatyniaHistoryUpdate',swiatyniaHistory); saveData() })
  socket.on('swiatyniaClearSnapshots',()=>{ swiatyniaSnapshots=[]; io.emit('swiatyniaSnapshotsUpdate',swiatyniaSnapshots); saveData() })
  socket.on('swiatyniaSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); swiatyniaSnapshots.unshift({id,name:data.name,pings:{...swiatyniaPings},ts:Date.now()}); if(swiatyniaSnapshots.length>20) swiatyniaSnapshots=swiatyniaSnapshots.slice(0,20); io.emit('swiatyniaSnapshotsUpdate',swiatyniaSnapshots); saveData() })
  socket.on('swiatyniaLoadSnapshot',(id)=>{ const s=swiatyniaSnapshots.find(x=>x.id===id); if(!s) return; swiatyniaPings={...s.pings}; io.emit('swiatyniaPingsUpdate',swiatyniaPings) })
  socket.on('swiatyniaDeleteSnapshot',(id)=>{ swiatyniaSnapshots=swiatyniaSnapshots.filter(x=>x.id!==id); io.emit('swiatyniaSnapshotsUpdate',swiatyniaSnapshots); saveData() })
  socket.emit('swiatyniaPingsUpdate',swiatyniaPings)
  socket.emit('swiatyniaHistoryUpdate',swiatyniaHistory)
  socket.emit('swiatyniaGeneralsUpdate',swiatyniaGenerals)
  socket.emit('swiatyniaSnapshotsUpdate',swiatyniaSnapshots)
  swiatyniaDeadHistory=swiatyniaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('swiatyniaDeadHistoryUpdate',swiatyniaDeadHistory)

  // === las ===
  socket.on('lasAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); lasPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; lasHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(lasHistory.length>2000) lasHistory=lasHistory.slice(-2000); io.emit('lasPingsUpdate',lasPings); io.emit('lasHistoryUpdate',lasHistory); saveData() })
  socket.on('lasRemovePing',(id)=>{ delete lasPings[id]; io.emit('lasPingsUpdate',lasPings); saveData() })
  socket.on('lasAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); lasGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('lasGeneralsUpdate',lasGenerals); saveData() })
  socket.on('lasRemoveGeneral',(id)=>{ delete lasGenerals[id]; io.emit('lasGeneralsUpdate',lasGenerals); saveData() })
  socket.on('lasAddDead',(dead)=>{ if(!dead||!dead.id) return; lasDeadHistory.push(dead); lasDeadHistory=lasDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('lasDeadHistoryUpdate',lasDeadHistory); saveData() })
  socket.on('lasRemoveDead',(id)=>{ lasDeadHistory=lasDeadHistory.filter(d=>d.id!==id); io.emit('lasDeadHistoryUpdate',lasDeadHistory); saveData() })
  socket.on('lasResetHistory',()=>{ lasHistory=[]; io.emit('lasHistoryUpdate',lasHistory); saveData() })
  socket.on('lasClearSnapshots',()=>{ lasSnapshots=[]; io.emit('lasSnapshotsUpdate',lasSnapshots); saveData() })
  socket.on('lasSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); lasSnapshots.unshift({id,name:data.name,pings:{...lasPings},ts:Date.now()}); if(lasSnapshots.length>20) lasSnapshots=lasSnapshots.slice(0,20); io.emit('lasSnapshotsUpdate',lasSnapshots); saveData() })
  socket.on('lasLoadSnapshot',(id)=>{ const s=lasSnapshots.find(x=>x.id===id); if(!s) return; lasPings={...s.pings}; io.emit('lasPingsUpdate',lasPings) })
  socket.on('lasDeleteSnapshot',(id)=>{ lasSnapshots=lasSnapshots.filter(x=>x.id!==id); io.emit('lasSnapshotsUpdate',lasSnapshots); saveData() })
  socket.emit('lasPingsUpdate',lasPings)
  socket.emit('lasHistoryUpdate',lasHistory)
  socket.emit('lasGeneralsUpdate',lasGenerals)
  socket.emit('lasSnapshotsUpdate',lasSnapshots)
  lasDeadHistory=lasDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('lasDeadHistoryUpdate',lasDeadHistory)

  // === pustynia ===
  socket.on('pustyniaAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); pustyniaPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; pustyniaHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(pustyniaHistory.length>2000) pustyniaHistory=pustyniaHistory.slice(-2000); io.emit('pustyniaPingsUpdate',pustyniaPings); io.emit('pustyniaHistoryUpdate',pustyniaHistory); saveData() })
  socket.on('pustyniaRemovePing',(id)=>{ delete pustyniaPings[id]; io.emit('pustyniaPingsUpdate',pustyniaPings); saveData() })
  socket.on('pustyniaAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); pustyniaGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('pustyniaGeneralsUpdate',pustyniaGenerals); saveData() })
  socket.on('pustyniaRemoveGeneral',(id)=>{ delete pustyniaGenerals[id]; io.emit('pustyniaGeneralsUpdate',pustyniaGenerals); saveData() })
  socket.on('pustyniaAddDead',(dead)=>{ if(!dead||!dead.id) return; pustyniaDeadHistory.push(dead); pustyniaDeadHistory=pustyniaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('pustyniaDeadHistoryUpdate',pustyniaDeadHistory); saveData() })
  socket.on('pustyniaRemoveDead',(id)=>{ pustyniaDeadHistory=pustyniaDeadHistory.filter(d=>d.id!==id); io.emit('pustyniaDeadHistoryUpdate',pustyniaDeadHistory); saveData() })
  socket.on('pustyniaResetHistory',()=>{ pustyniaHistory=[]; io.emit('pustyniaHistoryUpdate',pustyniaHistory); saveData() })
  socket.on('pustyniaClearSnapshots',()=>{ pustyniaSnapshots=[]; io.emit('pustyniaSnapshotsUpdate',pustyniaSnapshots); saveData() })
  socket.on('pustyniaSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); pustyniaSnapshots.unshift({id,name:data.name,pings:{...pustyniaPings},ts:Date.now()}); if(pustyniaSnapshots.length>20) pustyniaSnapshots=pustyniaSnapshots.slice(0,20); io.emit('pustyniaSnapshotsUpdate',pustyniaSnapshots); saveData() })
  socket.on('pustyniaLoadSnapshot',(id)=>{ const s=pustyniaSnapshots.find(x=>x.id===id); if(!s) return; pustyniaPings={...s.pings}; io.emit('pustyniaPingsUpdate',pustyniaPings) })
  socket.on('pustyniaDeleteSnapshot',(id)=>{ pustyniaSnapshots=pustyniaSnapshots.filter(x=>x.id!==id); io.emit('pustyniaSnapshotsUpdate',pustyniaSnapshots); saveData() })
  socket.emit('pustyniaPingsUpdate',pustyniaPings)
  socket.emit('pustyniaHistoryUpdate',pustyniaHistory)
  socket.emit('pustyniaGeneralsUpdate',pustyniaGenerals)
  socket.emit('pustyniaSnapshotsUpdate',pustyniaSnapshots)
  pustyniaDeadHistory=pustyniaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('pustyniaDeadHistoryUpdate',pustyniaDeadHistory)

  // === dolina ===
  socket.on('dolinaAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); dolinaPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; dolinaHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(dolinaHistory.length>2000) dolinaHistory=dolinaHistory.slice(-2000); io.emit('dolinaPingsUpdate',dolinaPings); io.emit('dolinaHistoryUpdate',dolinaHistory); saveData() })
  socket.on('dolinaRemovePing',(id)=>{ delete dolinaPings[id]; io.emit('dolinaPingsUpdate',dolinaPings); saveData() })
  socket.on('dolinaAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); dolinaGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('dolinaGeneralsUpdate',dolinaGenerals); saveData() })
  socket.on('dolinaRemoveGeneral',(id)=>{ delete dolinaGenerals[id]; io.emit('dolinaGeneralsUpdate',dolinaGenerals); saveData() })
  socket.on('dolinaAddDead',(dead)=>{ if(!dead||!dead.id) return; dolinaDeadHistory.push(dead); dolinaDeadHistory=dolinaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('dolinaDeadHistoryUpdate',dolinaDeadHistory); saveData() })
  socket.on('dolinaRemoveDead',(id)=>{ dolinaDeadHistory=dolinaDeadHistory.filter(d=>d.id!==id); io.emit('dolinaDeadHistoryUpdate',dolinaDeadHistory); saveData() })
  socket.on('dolinaResetHistory',()=>{ dolinaHistory=[]; io.emit('dolinaHistoryUpdate',dolinaHistory); saveData() })
  socket.on('dolinaClearSnapshots',()=>{ dolinaSnapshots=[]; io.emit('dolinaSnapshotsUpdate',dolinaSnapshots); saveData() })
  socket.on('dolinaSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); dolinaSnapshots.unshift({id,name:data.name,pings:{...dolinaPings},ts:Date.now()}); if(dolinaSnapshots.length>20) dolinaSnapshots=dolinaSnapshots.slice(0,20); io.emit('dolinaSnapshotsUpdate',dolinaSnapshots); saveData() })
  socket.on('dolinaLoadSnapshot',(id)=>{ const s=dolinaSnapshots.find(x=>x.id===id); if(!s) return; dolinaPings={...s.pings}; io.emit('dolinaPingsUpdate',dolinaPings) })
  socket.on('dolinaDeleteSnapshot',(id)=>{ dolinaSnapshots=dolinaSnapshots.filter(x=>x.id!==id); io.emit('dolinaSnapshotsUpdate',dolinaSnapshots); saveData() })
  socket.emit('dolinaPingsUpdate',dolinaPings)
  socket.emit('dolinaHistoryUpdate',dolinaHistory)
  socket.emit('dolinaGeneralsUpdate',dolinaGenerals)
  socket.emit('dolinaSnapshotsUpdate',dolinaSnapshots)
  dolinaDeadHistory=dolinaDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('dolinaDeadHistoryUpdate',dolinaDeadHistory)

  // === redlas ===
  socket.on('redlasAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); redlasPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; redlasHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(redlasHistory.length>2000) redlasHistory=redlasHistory.slice(-2000); io.emit('redlasPingsUpdate',redlasPings); io.emit('redlasHistoryUpdate',redlasHistory); saveData() })
  socket.on('redlasRemovePing',(id)=>{ delete redlasPings[id]; io.emit('redlasPingsUpdate',redlasPings); saveData() })
  socket.on('redlasAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); redlasGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('redlasGeneralsUpdate',redlasGenerals); saveData() })
  socket.on('redlasRemoveGeneral',(id)=>{ delete redlasGenerals[id]; io.emit('redlasGeneralsUpdate',redlasGenerals); saveData() })
  socket.on('redlasAddDead',(dead)=>{ if(!dead||!dead.id) return; redlasDeadHistory.push(dead); redlasDeadHistory=redlasDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('redlasDeadHistoryUpdate',redlasDeadHistory); saveData() })
  socket.on('redlasRemoveDead',(id)=>{ redlasDeadHistory=redlasDeadHistory.filter(d=>d.id!==id); io.emit('redlasDeadHistoryUpdate',redlasDeadHistory); saveData() })
  socket.on('redlasResetHistory',()=>{ redlasHistory=[]; io.emit('redlasHistoryUpdate',redlasHistory); saveData() })
  socket.on('redlasClearSnapshots',()=>{ redlasSnapshots=[]; io.emit('redlasSnapshotsUpdate',redlasSnapshots); saveData() })
  socket.on('redlasSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); redlasSnapshots.unshift({id,name:data.name,pings:{...redlasPings},ts:Date.now()}); if(redlasSnapshots.length>20) redlasSnapshots=redlasSnapshots.slice(0,20); io.emit('redlasSnapshotsUpdate',redlasSnapshots); saveData() })
  socket.on('redlasLoadSnapshot',(id)=>{ const s=redlasSnapshots.find(x=>x.id===id); if(!s) return; redlasPings={...s.pings}; io.emit('redlasPingsUpdate',redlasPings) })
  socket.on('redlasDeleteSnapshot',(id)=>{ redlasSnapshots=redlasSnapshots.filter(x=>x.id!==id); io.emit('redlasSnapshotsUpdate',redlasSnapshots); saveData() })
  socket.emit('redlasPingsUpdate',redlasPings)
  socket.emit('redlasHistoryUpdate',redlasHistory)
  socket.emit('redlasGeneralsUpdate',redlasGenerals)
  socket.emit('redlasSnapshotsUpdate',redlasSnapshots)
  redlasDeadHistory=redlasDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('redlasDeadHistoryUpdate',redlasDeadHistory)

  // === sohan ===
  socket.on('sohanAddPing',(data)=>{ const id=Date.now()+'-'+Math.random(); sohanPings[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; sohanHistory.push({x:data.x,y:data.y,ts:Date.now()}); if(sohanHistory.length>2000) sohanHistory=sohanHistory.slice(-2000); io.emit('sohanPingsUpdate',sohanPings); io.emit('sohanHistoryUpdate',sohanHistory); saveData() })
  socket.on('sohanRemovePing',(id)=>{ delete sohanPings[id]; io.emit('sohanPingsUpdate',sohanPings); saveData() })
  socket.on('sohanAddGeneral',(data)=>{ const id=Date.now()+'-'+Math.random(); sohanGenerals[id]={id,x:data.x,y:data.y,ch:data.ch,startedAt:Date.now()}; io.emit('sohanGeneralsUpdate',sohanGenerals); saveData() })
  socket.on('sohanRemoveGeneral',(id)=>{ delete sohanGenerals[id]; io.emit('sohanGeneralsUpdate',sohanGenerals); saveData() })
  socket.on('sohanAddDead',(dead)=>{ if(!dead||!dead.id) return; sohanDeadHistory.push(dead); sohanDeadHistory=sohanDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000); io.emit('sohanDeadHistoryUpdate',sohanDeadHistory); saveData() })
  socket.on('sohanRemoveDead',(id)=>{ sohanDeadHistory=sohanDeadHistory.filter(d=>d.id!==id); io.emit('sohanDeadHistoryUpdate',sohanDeadHistory); saveData() })
  socket.on('sohanResetHistory',()=>{ sohanHistory=[]; io.emit('sohanHistoryUpdate',sohanHistory); saveData() })
  socket.on('sohanClearSnapshots',()=>{ sohanSnapshots=[]; io.emit('sohanSnapshotsUpdate',sohanSnapshots); saveData() })
  socket.on('sohanSaveSnapshot',(data)=>{ const id=Date.now()+'-'+Math.random(); sohanSnapshots.unshift({id,name:data.name,pings:{...sohanPings},ts:Date.now()}); if(sohanSnapshots.length>20) sohanSnapshots=sohanSnapshots.slice(0,20); io.emit('sohanSnapshotsUpdate',sohanSnapshots); saveData() })
  socket.on('sohanLoadSnapshot',(id)=>{ const s=sohanSnapshots.find(x=>x.id===id); if(!s) return; sohanPings={...s.pings}; io.emit('sohanPingsUpdate',sohanPings) })
  socket.on('sohanDeleteSnapshot',(id)=>{ sohanSnapshots=sohanSnapshots.filter(x=>x.id!==id); io.emit('sohanSnapshotsUpdate',sohanSnapshots); saveData() })
  socket.emit('sohanPingsUpdate',sohanPings)
  socket.emit('sohanHistoryUpdate',sohanHistory)
  socket.emit('sohanGeneralsUpdate',sohanGenerals)
  socket.emit('sohanSnapshotsUpdate',sohanSnapshots)
  sohanDeadHistory=sohanDeadHistory.filter(d=>Date.now()-d.killedAt<35*60*1000)
  socket.emit('sohanDeadHistoryUpdate',sohanDeadHistory)

})

/* ======================
   START
====================== */

// Zapisz dane przed zamknięciem procesu (np. deploy)
async function gracefulShutdown(signal) {
  console.log("Zamykanie (" + signal + ") — zapisuję dane...")
  if (saveTimer) clearTimeout(saveTimer)
  // Zapisz timestamp zamknięcia żeby po restarcie nadrobić czas
  const shutdownTs = Date.now()
  if (col) {
    try {
      await col.updateOne({ _id: DOC_ID }, { $set: { shutdownAt: shutdownTs } })
    } catch(e) {}
  }
  await saveNow()
  console.log("Dane zapisane. Zamykam.")
  process.exit(0)
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT",  () => gracefulShutdown("SIGINT"))

connectDB().then(()=>{

  // ── Wznów timery Giganty/Małpy które były uruchomione przed restartem ──
  // timers{} zawiera sekundy zapisane w DB — jeśli > 0 to timer był aktywny
  // Problem: nie wiemy które BYŁY uruchomione, a które tylko zatrzymane z wartością > 0
  // Rozwiązanie: zapisujemy osobno listę "running" timerów
  for(const id in timers){
    if(runningTimers.has(id)){
      startTimer(id)
      console.log("Wznowiono timer:", id)
    }
  }
  for(const key in customTimers){
    if(runningCustomTimers.has(key)){
      startCustomTimer(key)
      console.log("Wznowiono custom timer:", key)
    }
  }

  http.listen(3000,()=>{ console.log("Server działa na porcie 3000") })
}).catch(err=>{
  console.error("Błąd połączenia z MongoDB:", err)
  process.exit(1)
})
