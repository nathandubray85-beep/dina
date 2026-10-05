const $=s=>document.querySelector(s);const $$=s=>document.querySelectorAll(s);
let me=null;
function toast(t){const x=$('#toast');x.textContent=t;x.style.display='block';setTimeout(()=>x.style.display='none',2500)}
async function api(url,opt={}){const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'Une erreur est survenue');return d}
$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#login').classList.toggle('hidden',b.dataset.tab!=='login');$('#register').classList.toggle('hidden',b.dataset.tab!=='register');$('#authMsg').textContent=''})
$('#login').onsubmit=async e=>{
  e.preventDefault();
  try{
    const body=Object.fromEntries(new FormData(e.target));
    const d=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    enter(d.user);
  }catch(e){ $('#authMsg').textContent=e.message; }
};
$('#register').onsubmit=async e=>{
  e.preventDefault();
  try{
    const body=Object.fromEntries(new FormData(e.target));
    const d=await api('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    enter(d.user);
  }catch(e){ $('#authMsg').textContent=e.message; }
};
async function enter(user){me=user;$('#auth').classList.add('hidden');$('#app').classList.remove('hidden');$('#hello').textContent=user.username;loadFeed()}
$('#logout').onclick=async()=>{await api('/api/logout',{method:'POST'});location.reload()};
$$('nav button[data-view]').forEach(b=>b.onclick=()=>{const v=b.dataset.view;$('#feedView').classList.toggle('hidden',v!=='feed');$('#profileView').classList.toggle('hidden',v!=='profile');if(v==='profile')loadProfile()});
$('#publish').onclick=async()=>{const fd=new FormData();fd.append('content',$('#postText').value);if($('#postImage').files[0])fd.append('image',$('#postImage').files[0]);try{await api('/api/posts',{method:'POST',body:fd});$('#postText').value='';$('#postImage').value='';toast('Publication créée ✨');loadFeed()}catch(e){toast(e.message)}};
async function loadFeed(){try{const d=await api('/api/feed');$('#feed').innerHTML=d.posts.map(post=>`<article class="post"><div class="postHead"><div class="avatar">${post.username[0].toUpperCase()}</div><div><div class="user">@${esc(post.username)}</div><div class="date">${new Date(post.created_at).toLocaleString('fr-FR')}</div></div></div>${post.content?`<div class="content">${esc(post.content)}</div>`:''}${post.image?`<img src="${post.image}" alt="Photo publiée">`:''}<div class="actions"><button class="${post.liked?'liked':''}" onclick="likePost(${post.id})">♥ ${post.likes}</button><button onclick="toggleComments(${post.id})">💬 ${post.comments}</button></div><div id="comments-${post.id}" class="comments hidden"></div></article>`).join('')||'<p style="text-align:center;color:#888">Aucune publication pour le moment.</p>'}catch(e){toast(e.message)}}
async function likePost(id){try{await api('/api/posts/'+id+'/like',{method:'POST'});loadFeed()}catch(e){toast(e.message)}}
async function toggleComments(id){const box=$('#comments-'+id);if(!box.classList.contains('hidden')){box.classList.add('hidden');return}const d=await api('/api/posts/'+id+'/comments');box.classList.remove('hidden');box.innerHTML=d.comments.map(c=>`<div class="comment"><b>@${esc(c.username)}</b>${esc(c.content)}</div>`).join('')+`<div class="commentBox"><input id="ci-${id}" maxlength="500" placeholder="Écrire un commentaire..."><button onclick="commentPost(${id})">Envoyer</button></div>`}
async function commentPost(id){const input=$('#ci-'+id);if(!input.value.trim())return;try{await api('/api/posts/'+id+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:input.value})});toggleComments(id);setTimeout(()=>toggleComments(id),50)}catch(e){toast(e.message)}}
async function loadProfile(){const d=await api('/api/users/'+me.username);$('#profileBox').innerHTML=`<div class="profileCard"><div class="avatar" style="width:70px;height:70px;font-size:28px">${me.username[0].toUpperCase()}</div><h2>@${esc(d.user.username)}</h2><p>${esc(d.user.bio||'Bienvenue sur Dina 👋')}</p><p><b>${d.posts.length}</b> publication(s)</p></div>`}
function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
api('/api/me').then(d=>enter(d.user)).catch(()=>{});
