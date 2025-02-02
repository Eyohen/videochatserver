
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());  // Add JSON body parser

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite's default port
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/rooms/create', (req, res) => {
  try {
    const { roomId, username, userId = 'test-user-id' } = req.body;
    
    if (!roomId || !username) {
      return res.status(400).json({ error: 'roomId and username are required' });
    }

    if (rooms.has(roomId)) {
      return res.status(409).json({ error: 'Room already exists' });
    }

    // Create new room in the rooms map
    rooms.set(roomId, new Map([[userId, username]]));
    
    res.status(201).json({
      message: 'Room created successfully',
      roomId,
      creator: {
        userId,
        username
      }
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rooms/join', (req, res) => {
  try {
    const { roomId, username, userId = 'test-user-id-2' } = req.body;
    
    if (!roomId || !username) {
      return res.status(400).json({ error: 'roomId and username are required' });
    }

    if (!rooms.has(roomId)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is already in room
    if (Array.from(rooms.get(roomId).values()).includes(username)) {
      return res.status(409).json({ error: 'Username already taken in this room' });
    }

    // Add user to room
    rooms.get(roomId).set(userId, username);
    
    // Get room information
    const roomUsers = Array.from(rooms.get(roomId).entries()).map(([id, name]) => ({
      userId: id,
      username: name
    }));

    res.status(200).json({
      message: 'Joined room successfully',
      roomId,
      users: roomUsers
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    
    if (!rooms.has(roomId)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const roomUsers = Array.from(rooms.get(roomId).entries()).map(([id, name]) => ({
      userId: id,
      username: name
    }));

    res.status(200).json({
      roomId,
      users: roomUsers,
      createdAt: Date.now() // You might want to store this when room is created
    });
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all active rooms (for testing purposes)
app.get('/api/rooms', (req, res) => {
  try {
    const activeRooms = Array.from(rooms.entries()).map(([roomId, users]) => ({
      roomId,
      users: Array.from(users.entries()).map(([id, name]) => ({
        userId: id,
        username: name
      }))
    }));

    res.status(200).json({
      count: activeRooms.length,
      rooms: activeRooms
    });
  } catch (error) {
    console.error('Error getting rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    
    if (!rooms.has(roomId)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    rooms.delete(roomId);
    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ roomId, username }) => {
    rooms.set(roomId, new Map([[socket.id, username]]));
    socket.join(roomId);
    console.log(`Room ${roomId} created by ${username} (${socket.id})`);
  });

  socket.on('join-room', ({ roomId, username }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).set(socket.id, username);
      socket.join(roomId);
      console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
      
      // Get the host's username (first user in the room)
      const hostUsername = Array.from(rooms.get(roomId).values())[0];
      
      // Emit to the joining user with host's username
      socket.emit('user-joined', { 
        userId: Array.from(rooms.get(roomId).keys())[0], 
        username: hostUsername 
      });
      
      // Emit to the host with joining user's username
      socket.to(roomId).emit('user-joined', { 
        userId: socket.id, 
        username 
      });
    }
  });

  socket.on('offer', (data) => {
    console.log('Relaying offer to room:', data.roomId);
    socket.to(data.roomId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    console.log('Relaying answer to room:', data.roomId);
    socket.to(data.roomId).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    console.log('Relaying ICE candidate to room:', data.roomId);
    socket.to(data.roomId).emit('ice-candidate', data);
  });

  socket.on('leave-room', (roomId) => {
    if (rooms.has(roomId)) {
      const username = rooms.get(roomId).get(socket.id);
      rooms.get(roomId).delete(socket.id);
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
      }
      socket.to(roomId).emit('user-left', { userId: socket.id, username });
      socket.leave(roomId);
      console.log(`User ${username} (${socket.id}) left room ${roomId}`);
    }
  });

  // for chatting 
  socket.on('send-message', (data) => {
    socket.to(data.roomId).emit('receive-message', {
      message: data.message,
      sender: data.sender,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        const username = users.get(socket.id);
        users.delete(socket.id);
        if (users.size === 0) {
          rooms.delete(roomId);
        }
        socket.to(roomId).emit('user-left', { userId: socket.id, username });
      }
    });
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});