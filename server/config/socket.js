const { Server } = require("socket.io");
const { corsOptions } = require("./env");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, { cors: corsOptions });

  io.on("connection", (socket) => {
    console.log("🔌 Socket conectado:", socket.id);
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  getIO
};
