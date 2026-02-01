// server.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/*
  clients map:
  ws -> { name, role }
*/
const clients = new Map();

/* ---------------- BROADCAST ---------------- */

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

/* ---------------- SERVER ---------------- */

wss.on("connection", (ws, req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  console.log("New connection from", ip);

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

      // Notify everyone (admin listens to this)
      broadcast({
        type: "system",
        event: "join",
        name: ws.name,
        ip: ws.ip,
        message: `${ws.name} joined`,
      });

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

          broadcast({
            type: "system",
            event: "leave",
            name: info.name,
            message: `${info.name} was kicked`,
          });
        }
      }
      return;
    }
  });

  /* ---------- DISCONNECT ---------- */
  ws.on("close", () => {
    if (ws.name) {
      clients.delete(ws);

      broadcast({
        type: "system",
        event: "leave",
        name: ws.name,
        message: `${ws.name} left`,
      });
    }
  });
});

/* ---------------- START ---------------- */

console.log(`Ghostline WebSocket server running on port ${PORT}`);
