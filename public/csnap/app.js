const $=s=>document.querySelector(s);
const statusEl=$('#status'),resEl=$('#result'),goBtn=$('#go'),urlIn=$('#url');
const STR={
id:{navIg:'Instagram',navTt:'TikTok',navYt:'YouTube',navFb:'Facebook',pill:'Gratis • Tanpa Watermark • HD 1080p',h1a:'Instagram',h1b:'Downloader',sub:'Download Reels, Foto, Video, Story & IGTV HD. Tempel link, klik Download — selesai 3 detik.',hint:'Contoh link:',s1t:'Cara Download — 3 Langkah',s1p:'Semudah copy-paste.',st1t:'Salin Link',st1p:'Buka IG > titik tiga > Salin Tautan.',st2t:'Tempel Link',st2p:'Tempel link lalu tekan Download.',st3t:'Simpan File',st3p:'Pilih kualitas HD/SD.',go:'⬇ Download',ph:'Tempel link Instagram di sini…',loading:'Mengambil media…',err:'Gagal: ',dl:'Download',prev:'Preview',open:'Buka'},
en:{navIg:'Instagram',navTt:'TikTok',navYt:'YouTube',navFb:'Facebook',pill:'Free • No Watermark • HD 1080p',h1a:'Instagram',h1b:'Downloader',sub:'Download Reels, Photos, Videos, Stories & IGTV in HD. Paste link, hit Download — done in 3s.',hint:'Example:',s1t:'How to Download — 3 Steps',s1p:'Easy copy-paste.',st1t:'Copy Link',st1p:'Open IG > three dots > Copy Link.',st2t:'Paste Link',st2p:'Paste link then press Download.',st3t:'Save File',st3p:'Pick HD/SD quality.',go:'⬇ Download',ph:'Paste Instagram link here…',loading:'Fetching media…',err:'Failed: ',dl:'Download',prev:'Preview',open:'Open'}};
let lang='id';
function setLang(l){lang=l;const d=STR[l];document.querySelectorAll('[data-i18n]').forEach(e=>{const k=e.dataset.i18n;if(d[k])e.textContent=d[k];});goBtn.textContent=d.go;urlIn.placeholder=d.ph;$('#btnId').classList.toggle('on',l==='id');$('#btnEn').classList.toggle('on',l==='en');}
$('#btnId').onclick=()=>setLang('id');$('#btnEn').onclick=()=>setLang('en');
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');urlIn.focus();});
$('#paste').onclick=async()=>{try{urlIn.value=await navigator.clipboard.readText();}catch{statusEl.textContent='Clipboard diblokir browser';}};
function setStatus(t,c){statusEl.textContent=t;statusEl.className=c||'';}
goBtn.onclick=doFetch;urlIn.addEventListener('keydown',e=>{if(e.key==='Enter')doFetch();});
async function doFetch(){
const url=urlIn.value.trim();
if(!url){setStatus(lang==='id'?'Tempel dulu link Instagram-nya!':'Paste an Instagram link first!','err');return;}
goBtn.disabled=true;goBtn.innerHTML='<span class="spin"></span>'+STR[lang].loading;setStatus('','');resEl.classList.remove('show');resEl.innerHTML='';
try{
const r=await fetch('/csnap/api/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
const j=await r.json();
if(!r.ok) throw new Error(j.error||'fetch failed');
render(j);setStatus('✓ '+(j.demo?'Mode demo aktif — alur UI OK':'Media ditemukan!'),'ok');
}catch(e){setStatus(STR[lang].err+e.message,'err');}
goBtn.disabled=false;goBtn.textContent=STR[lang].go;
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function render(j){
const tag=j.demo?'<span class="demoTag">DEMO</span>':'';
const rows=j.medias.map((m,i)=>`<div class="qitem"><div><div class="q">${esc(m.quality)}</div><small>${esc(m.label||m.kind)}${m.size?' • '+esc(m.size):''}</small></div><div class="sp"></div><a class="dl" href="${esc(m.url)}" target="_blank" rel="noopener">${STR[lang].open}</a><button class="dl ${i===0?'pri':''}" onclick="dl('${encodeURIComponent(m.url)}','${(m.kind||'video')==='image'?'csnap-photo.jpg':'csnap-'+esc(j.shortcode||'video')+'.mp4'}')">${STR[lang].dl}</button></div>`).join('');
resEl.innerHTML=`<div class="rhead"><img src="${esc(j.thumbnail||'')}" onerror="this.src='https://picsum.photos/seed/fallback/300/300'"><div><h3>${esc(j.author||'Instagram')}${tag}</h3><p>${esc(j.caption||'')}</p><small style="color:#9aa7c7">${esc(j.type)} • ${esc(j.shortcode||'')} ${j.duration?'• '+esc(j.duration):''}</small></div></div><div class="qlist">${rows}</div>${j.note?`<div class="note">⚠️ ${esc(j.note)}</div>`:''}`;
resEl.classList.add('show');resEl.scrollIntoView({behavior:'smooth',block:'nearest'});
}
window.dl=(u,fn)=>{window.location.href='/csnap/api/proxy?url='+u+'&filename='+encodeURIComponent(fn);};
setLang('id');
