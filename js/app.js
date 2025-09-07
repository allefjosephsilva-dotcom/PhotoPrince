async function api(path, opts){ opts = opts||{}; const headers = opts.headers||{};
  const token = sessionStorage.getItem('adminToken'); if(token) headers['x-admin-token'] = token;
  if(opts.body && !(opts.body instanceof FormData)) headers['content-type'] = 'application/json';
  opts.headers = headers;
  const res = await fetch('/api' + path, opts);
  return res.json();
}

async function refresh(){
  const j = await api('/photos');
  if(!j.ok) return;
  const photos = j.photos || [];
  document.getElementById('photoCount').textContent = photos.length + ' fotos';
  const grid = document.getElementById('photosGrid'); grid.innerHTML = '';
  const tpl = document.getElementById('photoTpl');
  for(const p of photos.slice().reverse()){
    const node = tpl.content.cloneNode(true);
    const img = node.querySelector('img'); img.src = p.url;
    node.querySelector('.likeCount').textContent = p.likes || 0;
    node.querySelector('.likeBtn').addEventListener('click', async ()=>{ const r = await fetch('/api/photo/' + p.id + '/like', { method:'POST' }); const rr = await r.json(); if(rr.ok) node.querySelector('.likeCount').textContent = rr.likes; });
    node.querySelector('.commentBtn').addEventListener('click', async ()=>{ const name = prompt('Seu nome (opcional):'); const text = prompt('Comentário:'); if(!text) return; await fetch('/api/photo/' + p.id + '/comment', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, text }) }); alert('Comentário enviado'); });
    grid.appendChild(node);
  }
  const sel = document.getElementById('uploadAlbum'); if(sel){ sel.innerHTML = '<option value="">-- Sem álbum --</option>'; Object.values(j.albums||{}).forEach(a=>{ const o=document.createElement('option'); o.value=a.id; o.textContent=a.name; sel.appendChild(o); }); }
  const model = j.model || {};
  if(model.name){ document.getElementById('modelName').textContent = model.name; document.getElementById('modelBio').textContent = model.bio || ''; document.getElementById('modelPhoto').src = model.photoDataUrl || ''; document.getElementById('modelLink').href = model.link || '#'; document.getElementById('modelBadge').textContent = 'Atualizado'; }
}

document.getElementById('ownerBtn').addEventListener('click', ()=> document.getElementById('drawer').classList.toggle('open'));

document.getElementById('ownerLogin').addEventListener('click', async ()=>{
  const pass = document.getElementById('ownerPass').value.trim(); if(!pass) return alert('Digite a senha');
  const res = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password: pass }) });
  const j = await res.json();
  if(j.ok){ sessionStorage.setItem('adminToken', j.token); document.getElementById('ownerStatus').textContent='Logado'; document.getElementById('ownerArea').style.display='block'; loadAlbumsMgmt(); alert('Logado'); }
  else alert('Senha incorreta');
});

document.getElementById('createAlbum').addEventListener('click', async ()=>{
  const name = document.getElementById('albumName').value.trim(); if(!name) return alert('Nome é obrigatório');
  const token = sessionStorage.getItem('adminToken'); if(!token) return alert('Faça login no painel');
  const res = await fetch('/api/albums', { method:'POST', headers:{'content-type':'application/json','x-admin-token': token}, body: JSON.stringify({ name }) });
  const j = await res.json(); if(j.ok){ document.getElementById('albumName').value=''; loadAlbumsMgmt(); refresh(); alert('Álbum criado'); }
});

async function loadAlbumsMgmt(){
  const j = await api('/photos');
  const sel = document.getElementById('uploadAlbum'); sel.innerHTML = '<option value="">-- Sem álbum --</option>';
  Object.values(j.albums||{}).forEach(a=>{ const o=document.createElement('option'); o.value=a.id; o.textContent=a.name; sel.appendChild(o); });
  const list = document.getElementById('albumsList'); if(list){ list.innerHTML=''; Object.values(j.albums||{}).forEach(a=>{ const row=document.createElement('div'); row.className='album-row'; row.innerHTML = `<span class="pill">${a.name}</span>`; const del=document.createElement('button'); del.className='btn'; del.textContent='Excluir'; del.addEventListener('click', ()=> alert('Exclusão não implementada no exemplo')); row.appendChild(del); list.appendChild(row); }); }
}

const dropzone = document.getElementById('dropzone'); const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', e=>{ e.preventDefault(); dropzone.style.borderColor='rgba(255,255,255,.5)'; });
dropzone.addEventListener('dragleave', ()=> dropzone.style.borderColor=''); dropzone.addEventListener('drop', e=>{ e.preventDefault(); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', e=> handleFiles(e.target.files));

async function handleFiles(files){ const token = sessionStorage.getItem('adminToken'); if(!token) return alert('Faça login'); const albumId = document.getElementById('uploadAlbum').value || ''; const fd = new FormData(); for(const f of files) fd.append('photos', f); fd.append('albumId', albumId); const res = await fetch('/api/upload', { method:'POST', headers:{'x-admin-token': token}, body: fd }); const j = await res.json(); if(j.ok){ alert('Upload concluído'); loadAlbumsMgmt(); refresh(); } else alert('Erro no upload'); }

document.getElementById('saveModel').addEventListener('click', async ()=>{
  const token = sessionStorage.getItem('adminToken'); if(!token) return alert('Faça login');
  const name = document.getElementById('modelNameInput').value.trim();
  const link = document.getElementById('modelLinkInput').value.trim();
  const bio = document.getElementById('modelBioInput').value.trim();
  const f = document.getElementById('modelPhotoInput').files[0];
  let photoDataUrl = '';
  if(f){ photoDataUrl = await fileToDataURL(f); }
  const res = await fetch('/api/model', { method:'POST', headers:{'content-type':'application/json','x-admin-token': token}, body: JSON.stringify({ name, link, bio, photoDataUrl }) });
  const j = await res.json(); if(j.ok){ alert('Modelo salvo'); refresh(); }
});

function fileToDataURL(file){ return new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(file); }); }

refresh();
loadAlbumsMgmt();