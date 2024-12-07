const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials:true
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // origin: "http://localhost:5173",
    origin: "https://videochat-one-chi.vercel.app",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("requestId", () => {
    socket.emit("idAssigned", socket.id);
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("userLeft");
  });

  socket.on("endCall", () => {
    socket.broadcast.emit("callEnded");
  });

  socket.on("callUser", ({ userToCall, signalData, from }) => {
    io.to(userToCall).emit("callUser", {
      signal: signalData,
      from
    });
  });

  socket.on("answerCall", (data) => {
    io.to(data.to).emit("callAccepted", data.signal);
  });

  socket.on("message", (message) => {
    io.emit("message", message);
  });
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});