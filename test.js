// server/test.js
const io = require('socket.io-client');

// Create two test clients
const client1 = io('http://localhost:3001');
const client2 = io('http://localhost:3001');

const testRoomId = 'test-room-123';

// First client joins
client1.emit('join-room', testRoomId);
client1.on('room-joined', (data) => {
  console.log('Client 1 joined:', data);
});

// Wait a bit and then have second client join
setTimeout(() => {
  client2.emit('join-room', testRoomId);
  client2.on('room-joined', (data) => {
    console.log('Client 2 joined:', data);
  });
}, 1000);

// Listen for peer events
client1.on('peer-joined', (peerId) => {
  console.log('Client 1 detected peer join:', peerId);
});

client2.on('peer-joined', (peerId) => {
  console.log('Client 2 detected peer join:', peerId);
});

// Listen for room-full events
client1.on('room-full', () => {
  console.log('Client 1 got room-full');
});

client2.on('room-full', () => {
  console.log('Client 2 got room-full');
});