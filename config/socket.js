const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

module.exports = function (server) {
  const io = new Server(server);
  const users = {};

  io.on('connection', (socket) => {
    console.log('a user connected');

    const conversationId = socket.handshake.query.conversationId;
    const userId = socket.handshake.query.userId;
    const qrSecret = socket.handshake.query.secret;
    if (conversationId) socket.join(conversationId);
    if (qrSecret) socket.join(qrSecret);
    if (userId) {
      socket.join(userId);
      users[socket.id] = userId;
      socket.emit('userOnline', userId);
    }

    socket.on('chat', messageData => {
      socket.broadcast.to(conversationId).emit('chat', messageData);
      messageData.message.recipientIds.forEach(r => io.to(r).emit('refreshConversation', messageData.message));
    });

    socket.on('createChat', data => {
      const recipients = data.users.filter(x => x._id !== userId).map(u => u._id);
      recipients.forEach(r => io.to(r).emit('newChat', data));
    });

    socket.on('qrLogin', ({id, secret}) => {
      const token = jwt.sign({id}, "secret");
      io.emit('qrLoginToken', token);
    });

    socket.on('isRecipientOnline', recipientId => {
      io.to(userId).emit('isRecipientOnline', !!Object.values(users).find(id => id === recipientId));
    });

    socket.on('offline', userId => {
      io.emit("userOffline", userId);
    });

    socket.on('online', userId => {
      io.emit("userOnline", userId);
    });

    socket.on('userTyping', status => {
      socket.broadcast.to(conversationId).emit("userTyping", status);
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
      delete users[socket.id];
    });
  });
};
