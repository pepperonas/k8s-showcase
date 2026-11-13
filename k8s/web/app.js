// Cluster-Seite: Anfragen verteilen, Kopien aendern, Kopien loeschen - mit Protokoll in Klartext.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const role = { api: 'beantwortet Anfragen', web: 'zeigt diese Seite', redis: 'gemeinsamer Notizzettel' };
  const slots = {};
  let nextSlot = 0;
  const colorOf = (name) => `var(--pod${(slots[name] ??= (nextSlot++ % 6)) + 1})`;
  const short = (name) => name.split('-').pop();

  // ---------- Protokoll ----------
  const log = $('#log');
  function say(text) {
    const empty = log.querySelector('.empty');
    if (empty) empty.remove();
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = new Date().toLocaleTimeString('de-DE');
    const s = document.createElement('span');
    s.textContent = text;
    li.append(t, s);
    log.prepend(li);
    while (log.children.length > 30) log.lastChild.remove();
  }

  // ---------- Anfragen ----------
  async function hello() {
    try {
      const r = await fetch('api/hello').then((x) => x.json());
      $('#visits').textContent = r.visits;
      const s = document.createElement('span');
      s.className = 'hit';
      s.textContent = short(r.pod);
      s.title = `Antwort von Kopie ${r.pod}`;
      s.style.color = colorOf(r.pod);
      $('#hits').prepend(s);
      while ($('#hits').children.length > 40) $('#hits').lastChild.remove();
      return r.pod;
    } catch (e) { return null; }
  }
  $('#hello').onclick = async () => { const p = await hello(); if (p) say(`Eine Anfrage, beantwortet von Kopie ${short(p)}.`); };
  $('#burst').onclick = async (ev) => {
    const btn = ev.currentTarget;   // nach dem ersten await ist currentTarget null
    btn.disabled = true;
    const seen = new Map();
    for (let i = 0; i < 20; i++) { const p = await hello(); if (p) seen.set(p, (seen.get(p) || 0) + 1); }
    btn.disabled = false;
    if (seen.size) say(`20 Anfragen, verteilt auf ${seen.size} ${seen.size === 1 ? 'Kopie' : 'Kopien'}: ` +
      [...seen].map(([p, n]) => `${short(p)} ×${n}`).join(', ') + '.');
  };

  // ---------- Kopien aendern ----------
  let rep = 0;
  document.querySelectorAll('[data-d]').forEach((b) => b.onclick = async () => {
    const n = Math.max(1, Math.min(6, rep + +b.dataset.d));
    if (n === rep) { say(n === 1 ? 'Mindestens eine Kopie muss laufen.' : 'Mehr als 6 Kopien gibt es in dieser Vorführung nicht.'); return; }
    const r = await fetch('api/scale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replicas: n }) });
    if (r.status === 429) { say('Zu viele Klicks auf einmal. Warte kurz und versuch es nochmal.'); return; }
    say(n > rep ? `Du willst jetzt ${n} Kopien. Kubernetes startet ${n - rep === 1 ? 'eine neue' : (n - rep) + ' neue'}.`
                : `Du willst jetzt ${n} ${n === 1 ? 'Kopie' : 'Kopien'}. Kubernetes beendet ${rep - n === 1 ? 'eine' : rep - n}.`);
    rep = n; $('#rep').textContent = n; poll();
  });

  // ---------- Loeschen ----------
  async function kill(name) {
    const r = await fetch('api/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (r.status === 429) { say('Zu viele Klicks auf einmal. Warte kurz und versuch es nochmal.'); return; }
    if (r.ok) say(`Du hast Kopie ${short(name)} gelöscht. Kubernetes merkt, dass eine fehlt, und startet Ersatz.`);
    poll();
  }

  // ---------- Live-Liste ----------
  let known = null;   // Name -> Zustand aus dem letzten Abruf
  function state(p) { return p.phase === 'Terminating' ? 'stop' : p.ready ? 'run' : 'start'; }
  const stateText = { run: 'läuft', start: 'startet …', stop: 'wird beendet …' };
  const stateColor = { run: 'var(--ok)', start: 'var(--warn)', stop: 'var(--bad)' };

  function render(ps) {
    const tb = $('#pods');
    tb.replaceChildren();
    for (const p of ps) {
      const st = state(p);
      const tr = document.createElement('tr');
      tr.style.opacity = st === 'stop' ? 0.5 : 1;
      const td = (...k) => { const c = document.createElement('td'); c.append(...k); return c; };
      const code = document.createElement('code');
      code.textContent = p.app === 'api' ? short(p.name) : p.app;
      code.title = p.name;
      if (p.app === 'api') code.style.color = colorOf(p.name);
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = stateColor[st];
      const restarts = td(String(p.restarts)); restarts.className = 'hide-sm';
      const act = td();
      if (p.app === 'api' && st !== 'stop') {
        const b = document.createElement('button');
        b.className = 'kill'; b.textContent = 'Löschen'; b.setAttribute('aria-label', `Kopie ${short(p.name)} löschen`);
        b.onclick = () => kill(p.name);
        act.append(b);
      }
      tr.append(td(code), td(role[p.app] || p.app), td(dot, stateText[st]), restarts, act);
      tb.append(tr);
    }
  }
  function diff(ps) {
    const now = new Map(ps.map((p) => [p.name, state(p)]));
    if (known) {
      for (const [n, st] of now) {
        const before = known.get(n);
        const what = n.startsWith('api-') ? `Kopie ${short(n)}` : n.split('-')[0];
        if (!before && st !== 'stop') say(`${what} wird gestartet.`);
        else if (before === 'start' && st === 'run') say(`${what} ist bereit und nimmt Anfragen an.`);
      }
      for (const [n] of known) if (!now.has(n)) say(`${n.startsWith('api-') ? 'Kopie ' + short(n) : n.split('-')[0]} ist beendet und verschwunden.`);
    }
    known = now;
  }
  async function poll() {
    try {
      const d = await fetch('api/pods').then((r) => r.json());
      rep = d.replicas; $('#rep').textContent = rep;
      render(d.pods); diff(d.pods);
    } catch (e) { /* naechster Versuch in 1,5 s */ }
  }
  poll(); setInterval(poll, 1500);
})();
