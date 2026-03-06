// =====================
// State
// =====================
let socket;
let clientId = localStorage.getItem("clientId");
let currentChatUser = null;
let db;
let profile = JSON.parse(localStorage.getItem("profile"));

// =====================
// DOM Elements
// =====================
const myIdSpan = document.getElementById("myId");
const usersList = document.getElementById("usersList");
const usersScreen = document.getElementById("usersScreen");
const chatScreen = document.getElementById("chatScreen");
const chatWithSpan = document.getElementById("chatWith");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const backBtn = document.getElementById("backBtn");

// =====================
// IndexedDB
// =====================



if (!profile) {

  const name = prompt("Enter your name");

  profile = {
    name: name || "User",
    avatar: generateAvatar(name)
  };

  localStorage.setItem("profile", JSON.stringify(profile));
}





function generateAvatar(name){

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#4a6cf7";
  ctx.fillRect(0,0,64,64);

  ctx.fillStyle = "white";
  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(name[0].toUpperCase(),32,32);

  return canvas.toDataURL();
}


const request = indexedDB.open("chatDB", 1);

request.onupgradeneeded = e => {

  const db = e.target.result;

  if (!db.objectStoreNames.contains("messages"))
    db.createObjectStore("messages", { keyPath: "id" });

  if (!db.objectStoreNames.contains("users"))
    db.createObjectStore("users", { keyPath: "id" });

  if (!db.objectStoreNames.contains("pending"))
    db.createObjectStore("pending", { keyPath: "id" });

};

request.onsuccess = e => {
  db = e.target.result;
  connect();
};
// =====================
// WebSocket
// =====================
function connect() {
  socket = new WebSocket(`wss://${location.host}`);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "auth",
      clientId: clientId,
      name: profile.name,
      avatar: profile.avatar
    }));

    if (clientId) myIdSpan.textContent = clientId;
    sendPendingMessages();
  };

  socket.onmessage = e => {
    const data = JSON.parse(e.data);
    console.log(data);

    if (data.type === "new_id") {
      clientId = data.clientId;
      localStorage.setItem("clientId", clientId);
      myIdSpan.textContent = clientId;
    }

    if (data.type === "users") {
      data.users.forEach(user => {saveUser(user.id, user.name, user.avatar, user.online);});
      loadUsers(data.users);
    }
    if (data.type === "message") {
      saveMessage(data);
      saveUser(data.from, data.name, data.avatar, user.online);
      if (data.from === currentChatUser) loadMessages();
    }
  };

  socket.onclose = () => setTimeout(connect, 2000);
}



// =====================
// UI Logic
// =====================

function openChat(userId) {

  currentChatUser = userId;

  const tx = db.transaction("users","readonly");
  const store = tx.objectStore("users");
  const req = store.get(userId);

  req.onsuccess = () => {

    const user = req.result;

    if(user){

      const status = user.online ? " 🟢" : " ⚫";

      chatWithSpan.textContent = (user.name || user.id) + status;

    }else{

      chatWithSpan.textContent = userId;

    }

  };

  usersScreen.classList.remove("active");
  chatScreen.classList.add("active");

  loadMessages();
}

backBtn.onclick = () => {
  chatScreen.classList.remove("active");
  usersScreen.classList.add("active");
};

sendBtn.onclick = sendMessage;

function saveUser(userId, name = null, avatar = null, online = false){

  const tx = db.transaction("users","readwrite");

  tx.objectStore("users").put({
    id: userId,
    name: name || userId,
    avatar: avatar,
    online: online,
    lastSeen: Date.now()
  });

}
function loadUsers(users){

  const tx = db.transaction("users","readonly");

  const request = tx.objectStore("users").getAll();

  request.onsuccess = () => {

    renderUsers(request.result, users.filter(u=>u.online).map(u=>u.id));

  };

}

function renderUsers(allUsers , onlineUsers){

  usersList.innerHTML = "";
  console.log(allUsers);

  allUsers.forEach(user => {

    if(user.id === clientId) return;

    const li = document.createElement("li");

    const img = document.createElement("img");
    img.src = user.avatar || "";
    img.width = 40;
    img.height = 40;
    img.style.borderRadius = "50%";

    const name = document.createElement("span");
    name.textContent = " " + (user.name || user.id);

    const status = document.createElement("span");
    status.textContent = onlineUsers.includes(user.id) ? " 🟢" : " ⚫";

    li.appendChild(img);
    li.appendChild(name);
    li.appendChild(status);

    li.onclick = () => openChat(user.id);

    usersList.appendChild(li);

  });

}
// =====================
// Messaging
// =====================

function sendPendingMessages(){

  const tx = db.transaction("pending","readwrite");

  const store = tx.objectStore("pending");

  const request = store.getAll();

  request.onsuccess = () => {

    request.result.forEach(msg => {

      socket.send(JSON.stringify(msg));

      store.delete(msg.id);

    });

  };

}


function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChatUser) return;

  const msg = {
    type: "message",
    id: crypto.randomUUID(),
    to: currentChatUser,
    message: text,
    name: profile.name,
    avatar: profile.avatar
  };

  if(socket.readyState === 1){
  socket.send(JSON.stringify(msg));
  }else{
  savePending(msg);
}

  saveMessage({
    ...msg,
    from: clientId,
    timestamp: Date.now()
  });

  messageInput.value = "";
  loadMessages();
}

function savePending(message){

  const tx = db.transaction("pending","readwrite");

  tx.objectStore("pending").put(message);

}

function saveMessage(message) {
  const tx = db.transaction("messages", "readwrite");
  tx.objectStore("messages").put(message);
}

function loadMessages() {
  const tx = db.transaction("messages", "readonly");
  const request = tx.objectStore("messages").getAll();

  request.onsuccess = () => {
    const messages = request.result;
    messagesDiv.innerHTML = "";

    messages
      .filter(m =>
        (m.from === clientId && m.to === currentChatUser) ||
        (m.from === currentChatUser && m.to === clientId)
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(msg => {

        const div = document.createElement("div");
        div.classList.add("message");
        div.classList.add(msg.from === clientId ? "sent" : "received");
        div.textContent = (msg.name || "") + " : " + msg.message;

        messagesDiv.appendChild(div);
      });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };
}
