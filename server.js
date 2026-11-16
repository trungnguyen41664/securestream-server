const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5e8,
  pingTimeout: 60000
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const usersDB = new Map();
const activeUsers = new Map();

app.get('/', (req, res) => {
  res.send('SecureStream Relay Server đang hoạt động bình thường!');
});

app.post('/api/register', (req, res) => {
  const { userId, password, publicKey } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu!' });
  }

  if (usersDB.has(userId)) {
    return res.status(400).json({ error: 'Tài khoản này đã tồn tại!' });
  }

  usersDB.set(userId, { password, publicKey: publicKey || '', createdAt: new Date() });
  console.log(`[Đăng ký] Tài khoản mới: ${userId}`);

  return res.status(201).json({
    success: true,
    message: 'Tạo tài khoản thành công!',
    userId,
    publicKey
  });
});

app.post('/api/login', (req, res) => {
  const { userId, password, publicKey } = req.body;
  const user = usersDB.get(userId);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
  }

  if (publicKey) {
    user.publicKey = publicKey;
  }

  console.log(`[Đăng nhập] ${userId} đã đăng nhập.`);
  return res.status(200).json({
    success: true,
    message: 'Đăng nhập thành công!',
    userId,
    publicKey: user.publicKey
  });
});

app.get('/api/users', (req, res) => {
  const userList = [];
  usersDB.forEach((value, key) => {
    userList.push({
      userId: key,
      publicKey: value.publicKey
    });
  });
  res.json({ users: userList });
});

io.on('connection', (socket) => {
  console.log(`[Socket] Kết nối mới: ${socket.id}`);

  socket.on('register_user', (userId) => {
    activeUsers.set(userId, socket.id);
    console.log(`[Online] ${userId} đã truy cập.`);
    io.emit('user_status_change', Array.from(activeUsers.keys()));
  });

  socket.on('send_message', (data) => {
    const targetSocketId = activeUsers.get(data.receiverId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_message', {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('send_file', (data) => {
    const targetSocketId = activeUsers.get(data.receiverId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_file', {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    for (let [userId, sockId] of activeUsers.entries()) {
      if (sockId === socket.id) {
        activeUsers.delete(userId);
        console.log(`[Offline] ${userId} đã thoát.`);
        io.emit('user_status_change', Array.from(activeUsers.keys()));
        break;
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 SecureStream Server đang chạy trên cổng ${PORT}`);
});