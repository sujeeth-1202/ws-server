const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/*
  clients map:
  ws -> { name, role, ip }
*/
const clients = new Map();

/* ---------------- HELPERS ---------------- */

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

/* ---------------- SERVER ---------------- */

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

      // ✅ Send existing users list ONLY to admin
      if (ws.role === "admin") {
        const users = [];
        for (const info of clients.values()) {
          if (info.role === "client") {
            users.push({
              name: info.name,
              ip: info.ip,
            });
          }
        }

        ws.send(
          JSON.stringify({
            type: "users",
            users,
          })
        );
      }

      // ✅ Broadcast join ONLY if a CLIENT joined
      if (ws.role === "client") {
        broadcastSystemForClients({
          type: "system",
          event: "join",
          name: ws.name,
          message: `${ws.name} joined`,
        });
      }

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

          // Notify clients only
          broadcastSystemForClients({
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
    if (ws.role === "client" && ws.name) {
      clients.delete(ws);

      broadcastSystemForClients({
        type: "system",
        event: "leave",
        name: ws.name,
        message: `${ws.name} left`,
      });
    }
  });
});

/* ---------------- START ---------------- */

console.log("Ghostline WebSocket server running on port " + PORT);
