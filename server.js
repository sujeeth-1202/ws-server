// server.js
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

/* ---------------- HTTP SERVER ---------------- */

const server = http.createServer((req, res) => {
  res.writeHead(426); // Upgrade Required
  res.end("WebSocket server");
});

/* ---------------- WEBSOCKET SERVER ---------------- */

const wss = new WebSocket.Server({ server });

/*
  clients map:
  ws -> { name, role, ip }
*/
const clients = new Map();

/* ---------------- ADMIN HELPERS ---------------- */

function sendLogToAdmins(text) {
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.role === "admin"
    ) {
      client.send(
        JSON.stringify({
          type: "log",
          message: text,
        })
      );
    }
  });
}

function sendUsersToAdmins() {
  const users = [];

  for (const info of clients.values()) {
    if (info.role === "client") {
      users.push({
        name: info.name,
        ip: info.ip,
      });
    }
  }

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.role === "admin"
    ) {
      client.send(
        JSON.stringify({
          type: "users",
          users,
        })
      );
    }
  });
}

/* ---------------- BROADCAST HELPERS ---------------- */

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastSystemForClients(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.role === "client"
    ) {
      client.send(msg);
    }
  });
}

/* ---------------- CONNECTION ---------------- */

wss.on("connection", (ws, req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    /* ---------- JOIN ---------- */
    if (data.type === "join") {
      ws.name = data.name;
      ws.role = data.role;
      ws.ip = ip;

      clients.set(ws, {
        name: ws.name,
        role: ws.role,
        ip: ws.ip,
      });

      // 🔇 Silent admin join
      if (ws.role === "admin") {
        sendUsersToAdmins();
        return;
      }

      // ✅ Client joined
      broadcastSystemForClients({
        type: "system",
        event: "join",
        name: ws.name,
        message: `${ws.name} joined`,
      });

      sendLogToAdmins(`${ws.name} joined (${ws.ip})`);
      sendUsersToAdmins();
      return;
    }

    /* ---------- CHAT ---------- */
    if (data.type === "chat") {
      broadcast({
        type: "chat",
        from: data.from,
        message: data.message,
      });
      return;
    }

    /* ---------- KICK ---------- */
    if (data.type === "kick" && data.role === "admin") {
      for (const [client, info] of clients.entries()) {
        if (info.name === data.target) {
          client.send(
            JSON.stringify({
              type: "system",
              message: "You were kicked by admin",
            })
          );

          client.close();
          clients.delete(client);

          broadcastSystemForClients({
            type: "system",
            event: "leave",
            name: info.name,
            message: `${info.name} was kicked`,
          });

          sendLogToAdmins(`${info.name} was kicked by admin`);
          sendUsersToAdmins();
        }
      }
      return;
    }
  });

  /* ---------- DISCONNECT ---------- */
  ws.on("close", () => {
    if (ws.role === "client" && ws.name) {
      clients.delete(ws);

      broadcastSystemForClients({
        type: "system",
        event: "leave",
        name: ws.name,
        message: `${ws.name} left`,
      });

      sendLogToAdmins(`${ws.name} left`);
      sendUsersToAdmins();
    }
  });
});

/* ---------------- START ---------------- */

server.listen(PORT, () => {
  console.log(`Ghostline WebSocket server running on port ${PORT}`);
});
