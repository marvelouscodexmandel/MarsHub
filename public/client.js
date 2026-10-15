(function(){
  const socket = io();

  const loginCard = document.getElementById('loginCard');
  const chatApp = document.getElementById('chatApp');
  const userInfo = document.getElementById('userInfo');
  const chatArea = document.getElementById('chatArea');
  const textInput = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');
  const plusBtn = document.getElementById('plusBtn');
  const fileInput = document.getElementById('fileInput');
  const micBtn = document.getElementById('micBtn');
  const onlineCount = document.getElementById('onlineCount');

  function beep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 740;
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 180);
    } catch (e) {}
  }

  function handleUserState(user) {
    if (!user) {
      loginCard.classList.remove('hidden');
      chatApp.classList.add('hidden');
      return;
    }

    loginCard.classList.add('hidden');
    chatApp.classList.remove('hidden');
    userInfo.innerHTML = `<div class="user-badge" style="color:${user.color}">${user.username} <span class="badge">✓</span> <span class="badge">EXCLUSIVE</span></div>`;
    socket.emit('join', user);
  }

  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      handleUserState(data.user || null);
    } catch (err) {
      handleUserState(null);
    }
  }

  function buildMessageMarkup(msg) {
    const mine = msg.user && msg.user.username === (window.currentUser && window.currentUser.username);
    const wrapper = document.createElement('div');
    wrapper.className = 'message ' + (mine ? 'me' : 'other');

    const meta = document.createElement('div');
    meta.innerHTML = `<strong style="color:${msg.user ? msg.user.color : '#fff'}">${msg.user ? msg.user.username : 'Unknown'}</strong> <small>${new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
    wrapper.appendChild(meta);

    if (msg.replyTo) {
      const reply = document.createElement('div');
      reply.className = 'reply';
      reply.textContent = '↪ Reply';
      wrapper.appendChild(reply);
    }

    if (msg.text) {
      const text = document.createElement('div');
      text.textContent = msg.text;
      wrapper.appendChild(text);
    }

    if (msg.file && msg.file.url) {
      const fileNode = document.createElement('div');
      if (msg.file.mime && msg.file.mime.startsWith('image/')) {
        fileNode.innerHTML = `<img src="${msg.file.url}" alt="${msg.file.name || 'upload'}" />`;
      } else if (msg.file.mime && msg.file.mime.startsWith('audio/')) {
        fileNode.innerHTML = `<audio controls src="${msg.file.url}"></audio>`;
      } else {
        fileNode.innerHTML = `<a href="${msg.file.url}" target="_blank" rel="noreferrer">${msg.file.name || 'file'}</a>`;
      }
      wrapper.appendChild(fileNode);
    }

    if (msg.voice && msg.voice.url) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = msg.voice.url;
      wrapper.appendChild(audio);
    }

    const reactions = document.createElement('div');
    reactions.innerHTML = '<button class="btn react" type="button">❤️</button> <button class="btn react" type="button">😂</button> <button class="btn react" type="button">🔥</button>';
    wrapper.appendChild(reactions);

    return wrapper;
  }

  socket.on('history', (msgs) => {
    chatArea.innerHTML = '';
    (msgs || []).forEach((m) => chatArea.appendChild(buildMessageMarkup(m)));
    chatArea.scrollTop = chatArea.scrollHeight;
  });

  socket.on('newMessage', (m) => {
    chatArea.appendChild(buildMessageMarkup(m));
    chatArea.scrollTop = chatArea.scrollHeight;
    beep();
  });

  socket.on('online', (users) => {
    onlineCount.textContent = Array.isArray(users) ? users.length : 0;
  });

  socket.on('typing', ({ username }) => {
    const indicator = document.createElement('div');
    indicator.className = 'message other';
    indicator.textContent = `${username} is jipping...`;
    chatArea.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1200);
  });

  socket.on('blocked', ({ reason }) => {
    alert(reason || 'Message blocked by AI filter');
  });

  sendBtn.addEventListener('click', () => {
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
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      socket.emit('newMessage', {
        file: { url: json.url, name: json.original, mime: json.mime }
      });
    } catch (err) {
      alert('Upload failed');
    }
  });

  micBtn.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Voice notes are not supported in this browser.');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const form = new FormData();
      form.append('file', blob, 'voice.webm');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      socket.emit('newMessage', { voice: { url: json.url, name: json.original, mime: json.mime } });
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    micBtn.textContent = '⏹️';
    micBtn.onclick = () => {
      recorder.stop();
      micBtn.textContent = '🎤';
      micBtn.onclick = null;
      setTimeout(() => {
        micBtn.onclick = arguments.callee;
      }, 250);
    };
  });

  loadCurrentUser();
})();
