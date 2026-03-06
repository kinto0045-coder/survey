const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

// تخزين المستخدمين
const users = new Map();

function broadcastUsers() {

  const list = Array.from(users.values()).map(u => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    online: u.online
  }));

  console.log("Users:", list);

  wss.clients.forEach(client => {

    if (client.readyState === WebSocket.OPEN && client.userId) {

      client.send(JSON.stringify({
        type: "users",
        users: list
      }));

    }

  });

}

wss.on("connection", (ws) => {

  console.log("Client connected");

  let currentClientId = null;

  ws.on("message", (data) => {

    const message = JSON.parse(data);

    // ===== AUTH =====
    if (message.type === "auth") {

      currentClientId = message.clientId || uuidv4();
      ws.userId = currentClientId;

      if (!users.has(currentClientId)) {

        users.set(currentClientId, {
          id: currentClientId,
          name: message.name || "User",
          avatar: message.avatar || null,
          socket: ws,
          online: true
        });

      } else {

        const user = users.get(currentClientId);

        user.socket = ws;
        user.online = true;
        user.name = message.name || user.name;
        user.avatar = message.avatar || user.avatar;

      }

      ws.send(JSON.stringify({
        type: "new_id",
        clientId: currentClientId
      }));

      broadcastUsers();
    }

    // ===== MESSAGE =====
    if (message.type === "message") {

      const targetUser = users.get(message.to);

      if (targetUser && targetUser.online) {

        targetUser.socket.send(JSON.stringify({
          type: "message",
          id: message.id,
          from: currentClientId,
          to: message.to,
          message: message.message,
          name: message.name,
          avatar: message.avatar,
          timestamp: Date.now()
        }));

      }

    }

  });

  ws.on("close", () => {

    if (currentClientId && users.has(currentClientId)) {

      const user = users.get(currentClientId);
      user.online = false;
      user.socket = null;

    }

    broadcastUsers();

  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
