const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;


// Create WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on port ${PORT}`);

// Broadcast helper
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', socket => {
  console.log('Client connected');

  // Notify all clients
  broadcast('>> A client joined');

  socket.on('message', message => {
    console.log(`Received: ${message}`);
    broadcast(`>> ${message}`);
  });

  socket.on('close', () => {
    console.log('Client disconnected');
    broadcast('>> A client left');
  });
});
