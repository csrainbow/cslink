const $=s=>document.querySelector(s);
const statusEl=$('#status'),resEl=$('#result'),goBtn=$('#go'),urlIn=$('#url');
const modeTabs=$('#modeTabs'),hintEx=$('#hintEx');
const PLATFORMS={
instagram:{dom:/instagram\.com|instagr\.am/i,ex:'instagram.com/reel/… • instagram.com/p/… • instagram.com/stories/…',ph:{id:'Tempel link Instagram… https://www.instagram.com/reel/xxxx/',en:'Paste Instagram link… https://www.instagram.com/reel/xxxx/'},modes:['reel','photo','story','igtv']},
tiktok:{dom:/tiktok\.com/i,ex:'tiktok.com/@user/video/… • vt.tiktok.com/…',ph:{id:'Tempel link TikTok… https://www.tiktok.com/@user/video/123',en:'Paste TikTok link… https://www.tiktok.com/@user/video/123'},modes:['video','slide','music']},
youtube:{dom:/youtube\.com|youtu\.be/i,ex:'youtube.com/watch?v=… • youtu.be/… • youtube.com/shorts/…',ph:{id:'Tempel link YouTube… https://www.youtube.com/watch?v=xxxx',en:'Paste YouTube link… https://www.youtube.com/watch?v=xxxx'},modes:['video','shorts','music']},
facebook:{dom:/facebook\.com|fb\.watch|fb\.com/i,ex:'facebook.com/reel/… • facebook.com/watch/… • fb.watch/…',ph:{id:'Tempel link Facebook… https://www.facebook.com/reel/xxxx',en:'Paste Facebook link… https://www.facebook.com/reel/xxxx'},modes:['video','reel','photo']}};
const MODELBL={reel:{id:'🎬 Reels',en:'🎬 Reels'},photo:{id:'🖼️ Foto / Post',en:'🖼️ Photo / Post'},story:{id:'📖 Story',en:'📖 Story'},igtv:{id:'📺 IGTV / Video',en:'📺 IGTV / Video'},video:{id:'🎬 Video',en:'🎬 Video'},slide:{id:'🖼️ Slide / Foto',en:'🖼️ Slide / Photo'},music:{id:'🎵 Musik / MP3',en:'🎵 Music / MP3'},shorts:{id:'⚡ Shorts',en:'⚡ Shorts'}};
const HEROT={instagram:['Instagram','Downloader'],tiktok:['TikTok','Downloader'],youtube:['YouTube','Downloader'],facebook:['Facebook','Downloader']};
let platform='instagram',mode='reel';
const STR={
id:{navIg:'Instagram',navTt:'TikTok',navYt:'YouTube',navFb:'Facebook',pill:'Gratis • Tanpa Watermark • HD 1080p',h1a:'Instagram',h1b:'Downloader',sub:'Download Reels, Foto, Video, Story & IGTV HD. Tempel link, klik Download — selesai 3 detik.',hint:'Contoh link:',s1t:'Cara Download — 3 Langkah',s1p:'Semudah copy-paste.',st1t:'Salin Link',st1p:'Buka IG > titik tiga > Salin Tautan.',st2t:'Tempel Link',st2p:'Tempel link lalu tekan Download.',st3t:'Simpan File',st3p:'Pilih kualitas HD/SD.',go:'⬇ Download',ph:'Tempel link Instagram di sini…',loading:'Mengambil media…',err:'Gagal: ',dl:'Download',prev:'Preview',open:'Buka'},
en:{navIg:'Instagram',navTt:'TikTok',navYt:'YouTube',navFb:'Facebook',pill:'Free • No Watermark • HD 1080p',h1a:'Instagram',h1b:'Downloader',sub:'Download Reels, Photos, Videos, Stories & IGTV in HD. Paste link, hit Download — done in 3s.',hint:'Example:',s1t:'How to Download — 3 Steps',s1p:'Easy copy-paste.',st1t:'Copy Link',st1p:'Open IG > three dots > Copy Link.',st2t:'Paste Link',st2p:'Paste link then press Download.',st3t:'Save File',st3p:'Pick HD/SD quality.',go:'⬇ Download',ph:'Paste Instagram link here…',loading:'Fetching media…',err:'Failed: ',dl:'Download',prev:'Preview',open:'Open'}};
let lang='id';
let AD_CONFIG={
  adsenseClient:'',
  adsenseSlots:{top:'',inline:'',footer:''},
  banners:{
    top:{img:'',url:'',alt:'Iklan'},
    inline:{img:'',url:'',alt:'Iklan'},
    footer:{img:'',url:'',alt:'Iklan'}
  }
};
async function initAds(){
  try{
    const r=await fetch('/csnap/api/config');
    const c=await r.json();
    if(c){
      AD_CONFIG={
        adsenseClient:(c.adsenseClient||'').trim(),
        adsenseSlots:{top:((c.adsenseSlots&&c.adsenseSlots.top)||'').trim(),inline:((c.adsenseSlots&&c.adsenseSlots.inline)||'').trim(),footer:((c.adsenseSlots&&c.adsenseSlots.footer)||'').trim()},
        banners:{
          top:(c.banners&&c.banners.top)||{img:'',url:'',alt:'Iklan'},
          inline:(c.banners&&c.banners.inline)||{img:'',url:'',alt:'Iklan'},
          footer:(c.banners&&c.banners.footer)||{img:'',url:'',alt:'Iklan'}
        }
      };
    }
  }catch(e){
    AD_CONFIG={adsenseClient:'',adsenseSlots:{top:'',inline:'',footer:''},banners:{top:{img:'',url:'',alt:'Iklan'},inline:{img:'',url:'',alt:'Iklan'},footer:{img:'',url:'',alt:'Iklan'}}};
  }
  loadAdSense();
  renderAds();
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function renderAds(){
  const useAdSense=!!(AD_CONFIG.adsenseClient&&window.adsbygoogle);
  document.querySelectorAll('[data-ad-slot]').forEach((slot)=>{
    const k=slot.dataset.adSlot;
    const slotId=AD_CONFIG.adsenseSlots[k];
    const b=AD_CONFIG.banners[k];
    if(useAdSense&&slotId){
      slot.innerHTML='';
      const ins=document.createElement('ins');
      ins.className='adsbygoogle';
      ins.style.display='block';
      ins.setAttribute('data-ad-client',AD_CONFIG.adsenseClient);
      ins.setAttribute('data-ad-slot',slotId);
      ins.setAttribute('data-ad-format','auto');
      ins.setAttribute('data-full-width-responsive','true');
      slot.appendChild(ins);
      try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}
    }else if(b&&b.img){
      slot.innerHTML='<a class="adlink" href="'+esc(b.url||'#')+'" target="_blank" rel="noopener sponsored"><img src="'+esc(b.img)+'" alt="'+esc(b.alt||'Iklan')+'" loading="lazy"></a>';
    }else{
      slot.innerHTML='';
    }
  });
}
function loadAdSense(){
  if(!AD_CONFIG.adsenseClient)return;
  const base='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+AD_CONFIG.adsenseClient;
  const s=document.createElement('script');
  s.async=true;
  s.crossOrigin='anonymous';
  s.src=base;
  s.onload=renderAds;
  document.head.appendChild(s);
}
function setLang(l){lang=l;const d=STR[l];document.querySelectorAll('[data-i18n]').forEach(e=>{const k=e.dataset.i18n;if(d[k])e.textContent=d[k];});goBtn.textContent=d.go;$('#btnId').classList.toggle('on',l==='id');$('#btnEn').classList.toggle('on',l==='en');setPlatform(platform,true);}
$('#btnId').onclick=()=>setLang('id');$('#btnEn').onclick=()=>setLang('en');
function detectPlatform(u){for(const k in PLATFORMS){if(PLATFORMS[k].dom.test(u))return k;}return null;}
function detectMode(p,u){
if(p==='instagram'){if(/\/(reel|reels)\//i.test(u))return'reel';if(/\/p\//i.test(u))return'photo';if(/\/stories\//i.test(u))return'story';if(/\/tv\//i.test(u))return'igtv';}
if(p==='tiktok'){if(/\/photo\//i.test(u))return'slide';if(/\/video\//i.test(u)||/vt\.|vm\./i.test(u))return'video';}
if(p==='youtube'){if(/\/shorts\//i.test(u))return'shorts';return'video';}
if(p==='facebook'){if(/\/reel\//i.test(u))return'reel';if(/\/photo|posts\//i.test(u))return'photo';return'video';}
return null;}
function renderModes(){modeTabs.innerHTML='';PLATFORMS[platform].modes.forEach((m)=>{const b=document.createElement('button');b.textContent=(MODELBL[m]&&MODELBL[m][lang])||m;b.dataset.tab=m;if(m===mode)b.classList.add('on');b.onclick=()=>{mode=m;renderModes();urlIn.focus();};modeTabs.appendChild(b);});}
function updateHint(){urlIn.placeholder=PLATFORMS[platform].ph[lang];if(hintEx)hintEx.textContent=PLATFORMS[platform].ex;}
function setPlatform(p,auto){if(!PLATFORMS[p])p='instagram';platform=p;const ms=PLATFORMS[p].modes;if(ms.indexOf(mode)<0)mode=ms[0];document.querySelectorAll('nav.links a').forEach(a=>a.classList.toggle('on',a.dataset.platform===p));const nm=HEROT[p];const ha=$('#heroTitleA'),hb=$('#heroTitleB');if(ha)ha.textContent=nm[0];if(hb)hb.textContent=nm[1];renderModes();updateHint();if(!auto)urlIn.focus();}
document.querySelectorAll('nav.links a').forEach(a=>a.onclick=(e)=>{e.preventDefault();setPlatform(a.dataset.platform||'instagram');});
urlIn.addEventListener('input',()=>{const u=urlIn.value.trim();if(!u)return;const p=detectPlatform(u);if(p&&p!==platform)setPlatform(p,true);const dm=detectMode(platform,u);if(dm&&dm!==mode){mode=dm;renderModes();}});
$('#paste').onclick=async()=>{try{urlIn.value=await navigator.clipboard.readText();urlIn.dispatchEvent(new Event('input'));}catch{statusEl.textContent='Clipboard diblokir browser';}};
function setStatus(t,c){statusEl.textContent=t;statusEl.className=c||'';}
goBtn.onclick=doFetch;urlIn.addEventListener('keydown',e=>{if(e.key==='Enter')doFetch();});
async function doFetch(){
let url=urlIn.value.trim();
if(!url){setStatus(lang==='id'?'Tempel dulu link-nya! Pilih platform (IG/TikTok/YouTube/FB) di atas.':'Paste a link first! Pick a platform above.','err');return;}
const p=detectPlatform(url);
if(!p){setStatus(lang==='id'?'Link tidak dikenali. Didukung: Instagram, TikTok, YouTube, Facebook.':'Unknown link. Supported: Instagram, TikTok, YouTube, Facebook.','err');return;}
if(p!==platform)setPlatform(p,true);
const dm=detectMode(platform,url);if(dm&&dm!==mode){mode=dm;renderModes();}
goBtn.disabled=true;goBtn.innerHTML='<span class="spin"></span>'+STR[lang].loading;setStatus('','');resEl.classList.remove('show');resEl.innerHTML='';
try{
const r=await fetch('/csnap/api/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,platform,mode})});
const j=await r.json();
if(!r.ok) throw new Error(j.error||'fetch failed');
if(j.platform&&j.platform!==platform)setPlatform(j.platform,true);
if(j.mode&&PLATFORMS[platform].modes.indexOf(j.mode)>=0){mode=j.mode;renderModes();}
render(j);setStatus('✓ '+(j.demo?'Mode demo aktif — info asli bila tersedia':'Media ditemukan!'),'ok');
}catch(e){setStatus(STR[lang].err+e.message,'err');}
goBtn.disabled=false;goBtn.textContent=STR[lang].go;
}
function render(j){
const tag=j.demo?'<span class="demoTag">DEMO</span>':'';
const rows=j.medias.map((m,i)=>`<div class="qitem"><div><div class="q">${esc(m.quality)}</div><small>${esc(m.label||m.kind)}${m.size?' • '+esc(m.size):''}</small></div><div class="sp"></div><a class="dl" href="${esc(m.url)}" target="_blank" rel="noopener">${STR[lang].open}</a><button class="dl ${i===0?'pri':''}" onclick="dl('${encodeURIComponent(m.url)}','${platform}-${esc(j.shortcode||'media')}${(m.kind||'video')==='image'?'.jpg':(m.kind==='audio'?'.mp3':'.mp4')}')">${STR[lang].dl}</button></div>`).join('');
resEl.innerHTML=`<div class="rhead"><img src="${esc(j.thumbnail||'')}" onerror="this.src='https://picsum.photos/seed/fallback/300/300'"><div><h3>${esc(j.author||'Instagram')}${tag}</h3><p>${esc(j.caption||'')}</p><small style="color:#9aa7c7">${esc(j.type)} • ${esc(j.shortcode||'')} ${j.duration?'• '+esc(j.duration):''}</small></div></div><div class="qlist">${rows}</div>${j.note?`<div class="note">⚠️ ${esc(j.note)}</div>`:''}`;
resEl.classList.add('show');resEl.scrollIntoView({behavior:'smooth',block:'nearest'});
}
window.dl=(u,fn)=>{window.location.href='/csnap/api/proxy?url='+u+'&filename='+encodeURIComponent(fn);};
setLang('id');
initAds();
