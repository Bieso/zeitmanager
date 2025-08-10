/* ===== Utilities & State ===== */
const $ = (q,el=document)=>el.querySelector(q);
const $$=(q,el=document)=>[...el.querySelectorAll(q)];
const fmtMins = m => (m>=60? (m/60).toFixed(1)+'h' : m+'m');
const todayTag = ()=> new Date().toLocaleDateString('de-DE',{weekday:'short', day:'2-digit', month:'2-digit'});

const LS_KEY='tm_data_v1';
const LS_NOTES='tm_notes_v1';

let state = load() || seed();
let barRangeStart = atStartOfDay(new Date(Date.now()-6*86400000)); // last 7d
let currentCategoryPath = []; // Our navigation state
let homeCarouselIndex = 0; // index for Home carousel

function load(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY)); }catch(_){ return null}
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function seed(){
  // Minimal Demo‑Daten
  const now = Date.now();
  const days = d => now - d*86400000;
  return {
    categories:{},
    notes: loadNotes(),
    logs:[
      log('Sport', ['Kraft', 'Beine'], 15, days(0)),
      log('Sport', ['Kraft', 'Arme'], 25, days(0)),
      log('Sport', ['Flexibilität'], 20, days(0)),
      log('Social Media',['Schneiden','Shorts'], 55, days(1)),
      log('Social Media',['Skript'], 30, days(2)),
      log('Social Media',['Posten'], 20, days(2)),
      log('Sport',['Kraft', 'Beine'], 20, days(6)),
      log('Social Media', [], 10, days(3)), // Direct time for Social Media -> "übrige Zeit"
      log('Sport', ['Kraft'], 10, days(4)), // Direct time for Kraft -> "übrige Zeit"
    ]
  };
  function log(cat, path, mins, ts){
    return {cat, path, minutes:mins, ts: ts || Date.now(), id:cryptoRandom()};
  }
}
function loadNotes(){
  try{ return JSON.parse(localStorage.getItem(LS_NOTES))||[] }catch(_){ return [] }
}
function saveNotes(list){ localStorage.setItem(LS_NOTES, JSON.stringify(list)); }

function cryptoRandom(){ return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2); }
function atStartOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }

const palette = [
  '#4ea8ff','#7ee787','#ffd166','#ff6b6b','#9b8cff',
  '#62d2ff','#c3ff99','#ffb3a7','#aee1ff','#f7e58b'
];

/* ===== Model helpers ===== */
function getChildrenOf(path = []) {
    const depth = path.length;
    const children = new Map();

    state.logs.forEach(log => {
        const fullLogPath = [log.cat, ...(log.path || [])];
        if (fullLogPath.length <= depth) return;

        let isPrefix = true;
        for (let i = 0; i < depth; i++) {
            if (fullLogPath[i] !== path[i]) {
                isPrefix = false;
                break;
            }
        }

        if (isPrefix) {
            const childName = fullLogPath[depth];
            const currentTotal = children.get(childName) || 0;
            children.set(childName, currentTotal + log.minutes);
        }
    });

    if (depth === 0) {
        Object.keys(state.categories).forEach(catName => {
            if (!children.has(catName)) {
                children.set(catName, 0);
            }
        });
    }
    return children;
}

function getDirectTimeFor(path = []) {
    const depth = path.length;
    if (depth === 0) return 0;

    let directTime = 0;
    state.logs.forEach(log => {
        const fullLogPath = [log.cat, ...(log.path || [])];
        if (fullLogPath.length === depth) {
            let matches = true;
            for (let i = 0; i < depth; i++) {
                if (fullLogPath[i] !== path[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                directTime += log.minutes;
            }
        }
    });
    return directTime;
}

function sumByTopCategory(rangeStart=null, rangeEnd=null){
  const map = {};
  state.logs.forEach(l=>{
    if(rangeStart && (l.ts<rangeStart || l.ts>(rangeEnd||Date.now()))) return;
    map[l.cat] = (map[l.cat]||0)+l.minutes;
  });
  return map;
}
function subAggByTop(cat, rangeStart=null, rangeEnd=null){
  const map = {};
  state.logs.forEach(l=>{
    if(l.cat!==cat) return;
    if(rangeStart && (l.ts<rangeStart || l.ts>(rangeEnd||Date.now()))) return;
    const key = l.path?.join(' › ') || '(ohne Unterkategorie)';
    map[key]=(map[key]||0)+l.minutes;
  });
  return map;
}
function seriesForCategory(cat, days=30){
  const out=[]; const today=atStartOfDay(new Date());
  for(let i=days-1;i>=0;i--){
    const start = +atStartOfDay(new Date(today- i*86400000));
    const end   = +endOfDay(new Date(start));
    const mins = state.logs
      .filter(l=>l.cat===cat && l.ts>=start && l.ts<=end)
      .reduce((a,b)=>a+b.minutes,0);
    out.push({t:new Date(start), v:mins});
  }
  return out;
}
function categoriesList(){
  const names = new Set(state.logs.map(l=>l.cat));
  Object.keys(state.categories).forEach(n=>names.add(n));
  return [...names];
}

/* ===== Rendering ===== */
function render(){
  renderCategoryCards();
  renderWeeklyPie();
  renderNotes();
  fillSelects();
  renderMainPie();
  renderBar();
  renderLine();
  renderCategoriesView();
}
function renderCategoryCards() {
    const el = $('#categoryCards');
    el.innerHTML = '';
    const cats = categoriesList();

    if (!cats.length) {
        el.innerHTML = `<div class="empty">Noch keine Einträge – über das <b>+</b> unten hinzufügen.</div>`;
        // Disable buttons if no categories
        $('#prevCatBtn').disabled = true;
        $('#nextCatBtn').disabled = true;
        return;
    }

    // Ensure carousel index is within bounds
    if (homeCarouselIndex >= cats.length) homeCarouselIndex = cats.length - 1;
    if (homeCarouselIndex < 0) homeCarouselIndex = 0;

    const name = cats[homeCarouselIndex];
    const total = sumByTopCategory()[name] || 0;

    // Build a single card (item) only
    const card = document.createElement('div');
    card.className = 'item';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div>
          <strong>${name}</strong>
          <div class="muted">${fmtMins(total)} gesamt</div>
        </div>
        <button class="ghost" data-edit="${encodeURIComponent(name)}">✎</button>
      </div>
      <div class="hr"></div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        ${Object.entries(subAggByTop(name)).slice(0,6).map(([k,v],idx)=>`
          <span class="chip"><span style="width:10px;height:10px;border-radius:50%;background:${palette[idx%palette.length]}"></span>${k} — ${fmtMins(v)}</span>
        `).join('') || `<span class="muted">Keine Unterkategorien erfasst.</span>`}
      </div>
    `;

    card.querySelector('[data-edit]').onclick=(e)=>{
      e.stopPropagation();
      openEdit([name]);
    };
    card.onclick=()=>{
      currentCategoryPath = [];
      switchView('categories');
    };
    el.appendChild(card);

    // Update button states
    $('#prevCatBtn').disabled = (homeCarouselIndex === 0);
    $('#nextCatBtn').disabled = (homeCarouselIndex >= cats.length - 1);
}

function renderCategoriesView() {
    const el = $('#view-categories');
    el.innerHTML = '';
    const nodes = getChildrenOf(currentCategoryPath);
    const directTime = getDirectTimeFor(currentCategoryPath);
    if (directTime > 0) {
        nodes.set('übrige Zeit', directTime);
    }

    if (nodes.size === 0) {
        el.innerHTML = `<div class="empty">Keine Unterkategorien hier. Füge eine über den <b>+</b> Button hinzu.</div>`;
        return;
    }

    const totalForLevel = Array.from(nodes.values()).reduce((a, b) => a + b, 0);

    Array.from(nodes.entries()).forEach(([name, total], i) => {
        const card = document.createElement('div');
        card.className = 'card';

        const subNodes = getChildrenOf([...currentCategoryPath, name]);
        const directSubTime = getDirectTimeFor([...currentCategoryPath, name]);
        if(directSubTime > 0){
            subNodes.set('übrige Zeit', directSubTime);
        }

        let itemsHTML = '';
        if (subNodes.size > 0) {
            const subNodeTotal = Array.from(subNodes.values()).reduce((a, b) => a + b, 0);
            itemsHTML = Array.from(subNodes.entries()).map(([subName, subTotal], idx) => {
                return `
                    <div class="item row" style="justify-content:space-between; align-items:center;">
                        <span>${subName} <span class="muted">(${fmtMins(subTotal)})</span></span>
                        <div class="mini-pie" data-pie-id="${i}-${idx}"></div>
                    </div>
                `;
            }).join('');
        } else {
            itemsHTML = `<div class="item muted">Keine weiteren Unterkategorien.</div>`;
        }
        
        let chipsHTML = '';
        if (subNodes.size > 0) {
             chipsHTML = `<div class="row chip-preview" id="chip-preview-${i}" style="gap:6px;flex-wrap:wrap;margin-top:10px;">
                ${Array.from(subNodes.entries()).slice(0,6).map(([k,v],idx)=>`
                  <span class="chip"><span style="width:10px;height:10px;border-radius:50%;background:${palette[idx%palette.length]}"></span>${k} — ${fmtMins(v)}</span>
                `).join('')}
              </div>`;
        }

        card.innerHTML = `
            <div class="row" style="justify-content:space-between; align-items:center;">
                <div style="flex:1; cursor:pointer;" data-cat-name="${name}">
                    <h2>${name} <span class="muted">(${fmtMins(total)})</span></h2>
                </div>
                <div class="mini-pie" data-pie-id="${i}" style="margin-left:10px;"></div>
                <button class="ghost toggle-btn" data-target="sub-card-${i}" data-chip-target="chip-preview-${i}" style="margin-left:10px;">▾</button>
            </div>
            ${chipsHTML}
            <div class="cards hidden" id="sub-card-${i}" style="margin-top:10px;">${itemsHTML}</div>
        `;
        el.appendChild(card);
        
        if (name !== 'übrige Zeit') {
            card.querySelector(`[data-cat-name="${name}"]`).onclick = (e) => {
                e.stopPropagation();
                currentCategoryPath.push(name);
                renderCategoriesView();
                updateHeader('categories');
            };
        } else {
            card.querySelector(`[data-cat-name="${name}"]`).style.cursor = 'default';
        }

        card.querySelector(`.toggle-btn`).onclick = (e) => {
            const btn = e.currentTarget;
            const targetId = btn.dataset.target;
            const chipTargetId = btn.dataset.chipTarget;
            const targetEl = $('#' + targetId);
            const chipTargetEl = $('#' + chipTargetId);

            const isHidden = targetEl.classList.toggle('hidden');
            if (chipTargetEl) chipTargetEl.classList.toggle('hidden', !isHidden);
            btn.textContent = isHidden ? '▾' : '▴';
        };

        const percentage = totalForLevel > 0 ? (total / totalForLevel) * 100 : 0;
        const pieContainer = card.querySelector(`[data-pie-id="${i}"]`);
        if (pieContainer) drawMiniPie(pieContainer, percentage, palette[i % palette.length]);

        if (subNodes.size > 0) {
            const subNodeTotalForPercentage = Array.from(subNodes.values()).reduce((a, b) => a + b, 0);
            Array.from(subNodes.entries()).forEach(([subName, subTotal], idx) => {
                const subPercentage = subNodeTotalForPercentage > 0 ? (subTotal / subNodeTotalForPercentage) * 100 : 0;
                const subPieContainer = card.querySelector(`[data-pie-id="${i}-${idx}"]`);
                if (subPieContainer) drawMiniPie(subPieContainer, subPercentage, palette[idx % palette.length]);
            });
        }
    });
}

function drawMiniPie(container, percentage, color = '#4ea8ff') {
  container.innerHTML = '';
  const svg = svgEl('svg', { viewBox: '0 0 36 36', width: '100%', height: '100%' });
  const r = 15.915494309189533;
  const circumference = 2 * Math.PI * r;

  svg.appendChild(svgEl('circle', {
    r: r, cx: 18, cy: 18, fill: 'transparent', stroke: '#2a3243', 'stroke-width': 3
  }));

  if(percentage > 0){
    const offset = circumference - (percentage / 100) * circumference;
    svg.appendChild(svgEl('circle', {
      r: r, cx: 18, cy: 18, fill: 'transparent', stroke: color, 'stroke-width': 3,
      'stroke-dasharray': `${circumference}`,
      'stroke-dashoffset': `${offset}`,
      'transform': 'rotate(-90 18 18)'
    }));
  }
  
  const text = svgEl('text', {
    x: 18, y: 21, 'text-anchor': 'middle', fill: '#fff', 'font-size': '10', 'font-weight': 'bold'
  });
  text.textContent = `${percentage.toFixed(0)}`;
  svg.appendChild(text);

  container.appendChild(svg);
}

function renderNotes(){
  const list = $('#notesList'); list.innerHTML='';
  const notes = state.notes || loadNotes();
  if(!notes.length){ list.innerHTML = `<div class="empty">Noch nichts gemerkt.</div>`; return; }
  notes.forEach((n,idx)=>{
    const div=document.createElement('div'); div.className='item';
    div.innerHTML = `
      <div>${n.text}</div>
      <div class="row" style="margin-top:8px;justify-content:space-between">
        <small class="muted">${new Date(n.ts).toLocaleString()}</small>
        <div class="actions">
          <button class="ghost" data-del="${idx}">Löschen</button>
        </div>
      </div>`;
    div.querySelector('[data-del]').onclick=()=>{
      notes.splice(idx,1); state.notes=notes; saveNotes(notes); renderNotes();
    };
    list.appendChild(div);
  });
}
$('#addNoteBtn').onclick=()=>{
  const val = $('#noteInput').value.trim();
  if(!val) return;
  const notes = state.notes || loadNotes();
  notes.unshift({text:val, ts:Date.now()});
  state.notes=notes; saveNotes(notes);
  $('#noteInput').value=''; renderNotes();
};

// Pies
function renderWeeklyPie(){
  const end = Date.now();
  const start = +atStartOfDay(new Date(end-6*86400000));
  const data = sumByTopCategory(start, end);
  drawPie($('#weeklyPie'), data, $('#weeklyPieLegend'), 'Diese Woche');
}
function renderMainPie(){
  const data = sumByTopCategory();
  drawPie($('#mainPie'), data, $('#mainPieLegend'), 'Gesamt');
}
function drawPie(container, map, legendEl, centerText=''){
  const entries = Object.entries(map);
  container.innerHTML='';
  legendEl.innerHTML='';
  if(!entries.length){ container.innerHTML = `<div class="center empty">Keine Daten</div>`; return; }
  const total = entries.reduce((a,[,v])=>a+v,0);
  const svg = svgEl('svg',{viewBox:'0 0 200 200', width:'100%', height:'100%'});
  const g   = svgEl('g',{transform:'translate(100,100)'});
  svg.appendChild(g);
  let angle= -Math.PI/2;
  entries.forEach(([k,v],i)=>{
    const frac = v/total;
    const a2 = angle + frac*2*Math.PI;
    const large = frac>0.5?1:0;
    const x1 = Math.cos(angle)*80, y1=Math.sin(angle)*80;
    const x2 = Math.cos(a2)*80,  y2=Math.sin(a2)*80;
    const path = svgEl('path',{
      d:`M 0 0 L ${x1} ${y1} A 80 80 0 ${large} 1 ${x2} ${y2} Z`,
      fill:palette[i%palette.length], opacity:.95
    });
    g.appendChild(path);
    angle=a2;

    // Legend
    const chip = document.createElement('span'); chip.className='chip';
    chip.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${palette[i%palette.length]}"></span>${k} — ${((v/total)*100).toFixed(0)}%`;
    legendEl.appendChild(chip);
  });
  // center label
  const circle = svgEl('circle',{r:46, fill: 'url(#grad)'});
  const ring   = svgEl('circle',{r:48, fill:'none', stroke:'rgba(255,255,255,.06)', 'stroke-width':4});
  g.appendChild(ring); g.appendChild(circle);
  const txt1= svgEl('text',{x:0,y:-2, 'text-anchor':'middle', fill:'#c8d1e0', 'font-size':'10'});
  txt1.textContent=centerText; g.appendChild(txt1);
  const txt2= svgEl('text',{x:0,y:14, 'text-anchor':'middle', fill:'#fff', 'font-size':'12', 'font-weight':'700'});
  txt2.textContent=fmtMins(total); g.appendChild(txt2);

  // subtle gradient def
  const defs = svgEl('defs',{}); const grad = svgEl('radialGradient',{id:'grad'});
  grad.appendChild(svgEl('stop',{'offset':'0%','stop-color':'#0f1115'}));
  grad.appendChild(svgEl('stop',{'offset':'100%','stop-color':'#141821'}));
  defs.appendChild(grad); svg.appendChild(defs);

  container.appendChild(svg);
}
function svgEl(tag,attrs){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

// Bar (Unterkategorien)
function fillSelects(){
  const cats = categoriesList();
  const sel1 = $('#barCategorySelect'); const sel2 = $('#lineCategorySelect');
  [sel1, sel2].forEach(sel=>{
    const current = sel.value;
    sel.innerHTML = cats.map(c=>`<option>${c}</option>`).join('');
    if(cats.includes(current)) sel.value=current;
  });
  if(!sel1.value && cats[0]) sel1.value=cats[0];
  if(!sel2.value && cats[0]) sel2.value=cats[0];
}
function renderBar(){
  const cat = $('#barCategorySelect').value;
  const start = +atStartOfDay(barRangeStart);
  const end = +endOfDay(new Date(start+6*86400000));
  $('#barRangeInfo').textContent = `${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}`;

  const map = subAggByTop(cat, start, end);
  drawBar($('#subBar'), map);
}
$('#barCategorySelect').onchange=renderBar;
$('#prev7').onclick=()=>{ barRangeStart = new Date(+barRangeStart - 7*86400000); renderBar(); };
$('#next7').onclick=()=>{ barRangeStart = new Date(+barRangeStart + 7*86400000); renderBar(); };

function drawBar(container, map){
  container.innerHTML='';
  const entries = Object.entries(map);
  if(!entries.length){ container.innerHTML = `<div class="center empty">Keine Daten</div>`; return; }
  const W=360, H=220, P=28;
  const max = Math.max(...entries.map(([,v])=>v));
  const svg = svgEl('svg',{viewBox:`0 0 ${W} ${H}`, width:'100%', height:'100%'});
  svg.appendChild(svgEl('rect',{x:0,y:0,width:W,height:H,fill:'transparent'}));
  // axes
  const base = H-P;
  svg.appendChild(line(P, base, W-P, base, '#2a3243'));
  svg.appendChild(line(P, 20, P, base, '#2a3243'));
  // bars
  const bw = (W-2*P)/entries.length - 8;
  entries.forEach(([k,v],i)=>{
    const x = P + 8 + i*((W-2*P)/entries.length);
    const h = (v/max)*(H-2*P);
    const y = base - h;
    const col = palette[i%palette.length];
    const r = svgEl('rect',{x, y, width:bw, height:h, fill:col, rx:6, ry:6, opacity:.95});
    svg.appendChild(r);
    // label
    const tl= svgEl('text',{x:x+bw/2, y:base+14, 'text-anchor':'middle', 'font-size':'9', fill:'#b8c0cf'});
    tl.textContent = k.length>12? k.slice(0,11)+'…' : k;
    svg.appendChild(tl);
    const tv= svgEl('text',{x:x+bw/2, y:y-6, 'text-anchor':'middle', 'font-size':'9', fill:'#e7eaf0'});
    tv.textContent = fmtMins(v); svg.appendChild(tv);
  });
  container.appendChild(svg);
}
function line(x1,y1,x2,y2,stroke){ return svgEl('line',{x1,y1,x2,y2,stroke,'stroke-width':1}); }

// Line (Zeitverlauf)
function renderLine(){
  const cat = $('#lineCategorySelect').value;
  const days = +$('#lineWindow').value;
  const data = seriesForCategory(cat, days);
  drawLine($('#timeLine'), data);
}
$('#lineCategorySelect').onchange=renderLine;
$('#lineWindow').onchange=renderLine;

function drawLine(container, data){
  container.innerHTML='';
  if(!data.length){ container.innerHTML = `<div class="center empty">Keine Daten</div>`; return; }
  const W=360, H=220, P=30;
  const max = Math.max(60, ...data.map(d=>d.v)); // mind. 60min für sinnvolle Skala
  const svg = svgEl('svg',{viewBox:`0 0 ${W} ${H}`, width:'100%', height:'100%'});
  const base=H-P;
  // axes
  svg.appendChild(line(P, base, W-P, base, '#2a3243'));
  svg.appendChild(line(P, 20, P, base, '#2a3243'));

  // path
  const step = (W-2*P) / (data.length-1);
  const pts = data.map((d,i)=>{
    const x = P + i*step;
    const y = base - (d.v/max)*(H-2*P);
    return [x,y,d];
  });
  const dstr = pts.map((p,i)=> (i?'L':'M')+p[0]+' '+p[1]).join(' ');
  svg.appendChild(svgEl('path',{d:dstr, fill:'none', stroke:palette[0], 'stroke-width':2.5}));
  // area
  svg.appendChild(svgEl('path',{d: dstr + ` L ${W-P} ${base} L ${P} ${base} Z`, fill:'#4ea8ff22'}));
  // dots + labels
  pts.forEach(([x,y,d],i)=>{
    svg.appendChild(svgEl('circle',{cx:x, cy:y, r:3, fill:palette[0]}));
    if(i%Math.ceil(data.length/6)===0){
      const t=svgEl('text',{x, y:base+14, 'text-anchor':'middle', 'font-size':'9', fill:'#b8c0cf'});
      t.textContent = d.t.toLocaleDateString('de-DE',{day:'2-digit', month:'2-digit'});
      svg.appendChild(t);
    }
  });
  // y‑ticks
  for(let m=0;m<=max;m+=Math.ceil(max/4)){
    const y = base - (m/max)*(H-2*P);
    svg.appendChild(line(P-3,y,W-P,y,'#222a3a'));
    const t=svgEl('text',{x:P-8, y:y+3, 'text-anchor':'end', 'font-size':'9', fill:'#b8c0cf'}); t.textContent=fmtMins(m);
    svg.appendChild(t);
  }
  container.appendChild(svg);
}

/* ===== Interactions ===== */
function updateHeader(viewName) {
    const titleEl = $('#mainTitle');
    const backBtn = $('#backBtn');

    if (viewName === 'home') {
        titleEl.innerHTML = `⏱️ Zeit‑Dashboard <span class="pill mono" id="datetag">${todayTag()}</span>`;
        backBtn.classList.add('hidden');
        currentCategoryPath = [];
    } else if (viewName === 'categories') {
        if (currentCategoryPath.length > 0) {
            titleEl.textContent = currentCategoryPath.join(' › ');
        } else {
            titleEl.textContent = 'Alle Kategorien';
        }
        backBtn.classList.remove('hidden');
    }
}

function switchView(viewName) {
  $$('section[id^="view-"]').forEach(el => {
    el.classList.toggle('hidden', el.id !== `view-${viewName}`);
  });
  $$('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === viewName);
  });
  updateHeader(viewName);
  if(viewName === 'categories') renderCategoriesView();
  else render();
}

// Tabs
$$('.tab').forEach(t=>{
  t.onclick=()=>{
    switchView(t.dataset.tab);
  };
});

$('#backBtn').onclick = () => {
    if (currentCategoryPath.length > 0) {
        currentCategoryPath.pop();
        renderCategoriesView();
        updateHeader('categories');
    } else {
        switchView('home');
    }
};

$('#view-home .card:first-child h2').style.cursor = 'pointer';
$('#view-home .card:first-child h2').onclick = () => switchView('categories');

// Add entry dialog
const entryDlg = $('#entryDlg');

$('#addBtn').onclick=()=>{
    const catTitleInput = $('#catTitle');
    const subPathInput = $('#subPath');
    const subPathLabel = subPathInput.parentElement;
    const descLabel = $('#catDesc').parentElement;

    catTitleInput.disabled = false;
    subPathLabel.style.display = 'block';
    descLabel.style.display = 'block';
    $('#catTitle').value = '';
    $('#catDesc').value = '';
    $('#subPath').value = '';
    $('#minutes').value = '30';

    if (!$('#view-categories').classList.contains('hidden')) {
        $('#dlgTitle').textContent = 'Neuer Eintrag / Zeit hinzufügen';
        catTitleInput.placeholder = 'Titel für neue Unterkategorie (optional)';
    } else {
        $('#dlgTitle').textContent='Zeit erfassen';
        catTitleInput.placeholder = 'z. B. Social Media / Sport';
    }
    entryDlg.showModal();
};

$('#saveEntry').onclick=()=>{
    const title = $('#catTitle').value.trim();
    const desc = $('#catDesc').value.trim();
    const minutes = Math.max(0, +$('#minutes').value || 0);
    const ts = $('#ts').value ? new Date($('#ts').value).getTime() : Date.now();

    let logCat, logPath;

    if (!$('#view-categories').classList.contains('hidden')) {
        // We are in category view
        if (currentCategoryPath.length === 0) { // Top level
            if (!title) { alert("Bitte einen Titel für die neue Hauptkategorie angeben."); return; }
            logCat = title;
            logPath = [];
        } else { // We are in a sub-category
            logCat = currentCategoryPath[0];
            if (title) { // Creating a new sub-sub-category
                logPath = [...currentCategoryPath.slice(1), title];
            } else { // Adding time to the current sub-category
                logPath = currentCategoryPath.slice(1);
            }
        }
    } else {
        // We are in home view
        if (!title) { alert("Bitte einen Titel für die Kategorie angeben."); return; }
        logCat = title;
        logPath = $('#subPath').value.split('›').map(s => s.trim()).filter(Boolean);
    }

    state.logs.push({ id: cryptoRandom(), cat: logCat, path: logPath, minutes, ts });
    if(desc && !logPath.length) { // Only save descriptions for top-level categories for now
        state.categories[logCat] = state.categories[logCat] || {};
        state.categories[logCat].desc = desc;
    }
    save();
    entryDlg.close();
    render();
};

// Edit node (category meta)
const editDlg = $('#editDlg');
let editPathRef=null;
function openEdit(pathArr){
  editPathRef = pathArr;
  $('#editPath').textContent = pathArr.join(' › ');
  const meta = state.categories[pathArr[0]] || {};
  $('#editTitle').value = pathArr[pathArr.length-1];
  $('#editDesc').value = meta.desc||'';
  editDlg.showModal();
}
$('#applyEdit').onclick=()=>{
  const newTitle = $('#editTitle').value.trim();
  const newDesc = $('#editDesc').value.trim();
  if(!editPathRef) return;
  const oldTop = editPathRef[0];
  state.logs.forEach(l=>{ if(l.cat===oldTop) l.cat=newTitle; });
  const oldMeta = state.categories[oldTop]||{};
  delete state.categories[oldTop];
  state.categories[newTitle] = {desc:newDesc||oldMeta.desc||''};
  save(); editDlg.close(); render();
};
$('#deleteNode').onclick=()=>{
  if(!editPathRef) return;
  const top = editPathRef[0];
  if(!confirm(`Alle Einträge der Kategorie "${top}" löschen?`)) return;
  state.logs = state.logs.filter(l=>l.cat!==top);
  delete state.categories[top];
  save(); editDlg.close(); render();
};

// NLP demo
$('#nlpAdd').onclick=()=>{
  const t = $('#nlpInput').value.trim();
  if(!t) return;
  const mins = (t.match(/(\d+)\s*(?:min|m)/i)||[])[1];
  const cat  = (t.match(/(?:min\s+)([^→>]+)/i)||[])[1]?.trim() || 'Sonstiges';
  const path = t.split(/→|›|>/).slice(1).map(s=>s.trim()).filter(Boolean);
  if(!mins){ $('#nlpFeedback').textContent='Konnte keine Minuten finden (Format: 35min).'; return; }
  state.logs.push({id:cryptoRandom(), cat, path, minutes:+mins, ts:Date.now()});
  save(); $('#nlpInput').value=''; $('#nlpFeedback').textContent='Hinzugefügt.';
  render();
};

/* ===== Initial render ===== */
$('#datetag').textContent = todayTag();
// Carousel controls for Home categories
$('#prevCatBtn').onclick = () => {
  homeCarouselIndex = Math.max(0, homeCarouselIndex - 1);
  renderCategoryCards();
};
$('#nextCatBtn').onclick = () => {
  const len = categoriesList().length;
  homeCarouselIndex = Math.min(len - 1, homeCarouselIndex + 1);
  renderCategoryCards();
};
render();