// client.js
(async function(){
  const socket = io();
  const userRes = await fetch('/api/user');
  const data = await userRes.json();
  const user = data.user;
  const loginCard = document.getElementById('loginCard');
  const chatApp = document.getElementById('chatApp');
  const userInfo = document.getElementById('userInfo');
  const chatArea = document.getElementById('chatArea');
  const textInput = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  const plusBtn = document.getElementById('plusBtn');
  const fileInput = document.getElementById('fileInput');
  const micBtn = document.getElementById('micBtn');
  const newMsgSound = document.getElementById('newMsgSound');
  const onlineCount = document.getElementById('onlineCount');

  if (!user) {
    loginCard.classList.remove('hidden');
    chatApp.classList.add('hidden');
  } else {
    loginCard.classList.add('hidden');
    chatApp.classList.remove('hidden');
    userInfo.innerHTML = `<div class="user-badge" style="color:${user.color}">${user.username} <span class="badge">✓</span> <span class="badge">EXCLUSIVE</span></div>`;
    socket.emit('join', user);
  }

  function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html!==undefined) e.innerHTML = html; return e }

  function renderMessage(m){
    const div = el('div', 'message ' + ((m.user.username === (user && user.username)) ? 'me' : 'other'));
    const meta = el('div','meta',`<strong style="color:${m.user.color}">${m.user.username}</strong> <small>${new Date(m.time).toLocaleTimeString()}</small>`);
    div.appendChild(meta);
    if (m.replyTo) {
      div.appendChild(el('div','reply','↪ Reply'));
    }
    if (m.text) div.appendChild(el('div','text',m.text));
    if (m.file) {
      const f = m.file;
      if (f.mime && f.mime.startsWith('image/')) {
        const img = el('img','',`<img src="${f.url}" style="max-width:220px;border-radius:8px" />`);
        div.appendChild(img);
      } else {
        const a = el('a','',`<a href="${f.url}" target="_blank">${f.name}</a>`);
        div.appendChild(a);
      }
    }
    if (m.voice) {
      const audio = el('audio','',`<audio controls src="${m.voice.url}"></audio>`);
      div.appendChild(audio);
    }
    const actions = el('div','actions',`<button class="btn react">❤️</button> <button class="btn react">😂</button> <button class="btn del">Delete</button> <button class="btn pin">Pin</button>`);
    div.appendChild(actions);
    return div;
  }

  socket.on('history', (msgs) => {
    chatArea.innerHTML = '';
    msgs.forEach(m => chatArea.appendChild(renderMessage(m)));
    chatArea.scrollTop = chatArea.scrollHeight;
  });

  socket.on('newMessage', (m) => {
    chatArea.appendChild(renderMessage(m));
    newMsgSound.play().catch(()=>{});
    chatArea.scrollTop = chatArea.scrollHeight;
  });

  socket.on('online', (list) => {
    onlineCount.textContent = list.length;
  });

  socket.on('typing', ({ username }) => {
    // show fleeting typing indicator
    const t = el('div','typing',`${username} is jipping...`);
    chatArea.appendChild(t);
    setTimeout(()=>t.remove(),1200);
  });

  socket.on('blocked', ({ reason }) => {
    alert(reason);
  });

  sendBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;
    socket.emit('newMessage', { text });
    textInput.value = '';
  });

  textInput.addEventListener('input', () => {
    socket.emit('typing');
  });

  plusBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    const res = await fetch('/api/upload', { method:'POST', body: form });
    const json = await res.json();
    socket.emit('newMessage', { file: { url: json.url, name: json.original, size: json.size, mime: json.mime } });
  });

  // Voice recording
  let mediaRecorder, audioChunks = [];
  let recording = false;
  micBtn.addEventListener('click', async () => {
    if (!recording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const form = new FormData();
        form.append('file', blob, 'voice.webm');
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const json = await res.json();
        // send as voice message
        socket.emit('newMessage', { voice: { url: json.url, name: json.original, size: json.size, mime: json.mime } });
      };
      mediaRecorder.start();
      micBtn.textContent = '⏺️ Stop';
      recording = true;
    } else {
      mediaRecorder.stop();
      micBtn.textContent = '🎤';
      recording = false;
    }
  });

})();
