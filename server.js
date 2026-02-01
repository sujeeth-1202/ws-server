const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: process.env.PORT || 8080,
});

const clients = new Map(); 
// ws -> { name, role, ip }

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastToAdmins(data) {
  for (const [ws, info] of clients.entries()) {
    if (info.role === "admin" && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

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
      clients.set(ws, {
        name: data.name,
        role: data.role,
        ip,
      });

      // Only CLIENT joins are logged
      if (data.role === "client") {
        broadcastToAdmins({
          type: "system",
          message: `${data.name} joined from ${ip}`,
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
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (!info) return;

    clients.delete(ws);

    if (info.role === "client") {
      broadcastToAdmins({
        type: "system",
        message: `${info.name} left`,
      });
    }
  });
});

console.log("WebSocket server running");
