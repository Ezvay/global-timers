/* ═══════════════════════════════
   GLOBALNY SYSTEM AUTORYZACJI
   Wywołaj: requireAuth() na każdej stronie
═══════════════════════════════ */
(function() {
  const KEY = 'pt_auth_v1';
  const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24h

  function isAuthed() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > EXPIRE_MS) {
        sessionStorage.removeItem(KEY);
        return false;
      }
      return data.ok === true;
    } catch(e) { return false; }
  }

  function setAuthed() {
    sessionStorage.setItem(KEY, JSON.stringify({ ok: true, ts: Date.now() }));
  }

  window.requireAuth = function() {
    if (isAuthed()) return; // już zalogowany

    // Wstrzyknij overlay hasła
    const style = document.createElement('style');
    style.textContent = `
      #auth-overlay {
        position:fixed;inset:0;z-index:99999;
        background:linear-gradient(160deg,#0d0a06,#090704);
        display:flex;align-items:center;justify-content:center;
      }
      #auth-box {
        background:linear-gradient(160deg,#1e1810,#100d08);
        border:1px solid rgba(201,168,76,0.4);
        border-radius:4px;padding:36px 40px;min-width:320px;
        box-shadow:0 0 60px rgba(0,0,0,0.9);
        display:flex;flex-direction:column;align-items:center;gap:16px;
        position:relative;
      }
      #auth-box::before,#auth-box::after {
        content:'';position:absolute;width:16px;height:16px;
        border-color:rgba(201,168,76,0.3);border-style:solid;
      }
      #auth-box::before{top:8px;left:8px;border-width:1px 0 0 1px;}
      #auth-box::after{bottom:8px;right:8px;border-width:0 1px 1px 0;}
      #auth-logo {
        font-family:'Cinzel',serif;font-size:13px;letter-spacing:4px;
        color:#c9a84c;text-transform:uppercase;text-align:center;
        margin-bottom:4px;
      }
      #auth-sub {
        font-size:11px;color:rgba(122,106,80,0.8);font-family:'Cinzel',serif;
        letter-spacing:2px;text-transform:uppercase;
      }
      #auth-input {
        width:100%;background:#0e0b07;
        border:1px solid rgba(201,168,76,0.3);
        color:#d4c4a0;font-family:'Crimson Text',serif;font-size:16px;
        padding:10px 14px;border-radius:2px;outline:none;
        text-align:center;letter-spacing:4px;
        transition:border-color 0.2s;
      }
      #auth-input:focus{border-color:rgba(201,168,76,0.7);}
      #auth-input.error{border-color:rgba(200,60,60,0.7);animation:shake 0.3s;}
      @keyframes shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-6px);}75%{transform:translateX(6px);}}
      #auth-btn {
        width:100%;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;
        text-transform:uppercase;padding:10px;border-radius:2px;cursor:pointer;
        background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.45);
        color:#c9a84c;transition:all 0.2s;
      }
      #auth-btn:hover{background:rgba(201,168,76,0.22);border-color:rgba(201,168,76,0.7);}
      #auth-err {
        font-size:11px;color:#c05050;font-family:'Cinzel',serif;
        letter-spacing:1px;min-height:16px;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div id="auth-box">
        <div id="auth-logo">⚔ Patologiczne Timery</div>
        <div id="auth-sub">Gildia Patologów</div>
        <input id="auth-input" type="password" placeholder="••••••••" autocomplete="off" spellcheck="false">
        <button id="auth-btn">Wejdź</button>
        <div id="auth-err"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Podłącz socket do weryfikacji
    function tryLogin() {
      const pass = document.getElementById('auth-input').value;
      const input = document.getElementById('auth-input');
      const errEl = document.getElementById('auth-err');

      if (!pass) return;

      // Użyj socket.io jeśli dostępne, fallback na prosty check
      if (window.io) {
        const sock = io();
        sock.emit('checkPassword', pass, (ok) => {
          if (ok) {
            setAuthed();
            overlay.remove();
            sock.disconnect();
          } else {
            input.classList.add('error');
            errEl.textContent = 'Nieprawidłowe hasło';
            input.value = '';
            setTimeout(() => input.classList.remove('error'), 400);
          }
        });
      }
    }

    document.getElementById('auth-btn').addEventListener('click', tryLogin);
    document.getElementById('auth-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') tryLogin();
    });

    // Focus
    setTimeout(() => document.getElementById('auth-input')?.focus(), 100);
  };
})();
