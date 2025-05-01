const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Configure CORS for the deployed frontend
const io = socketIo(server, {
    cors: {
        origin: "https://video-calling-frontend-3iox.onrender.com",
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors({
    origin: "https://video-calling-frontend-3iox.onrender.com",
    credentials: true
}));

// Only allow production environment
if (process.env.NODE_ENV !== 'production') {
    console.error('This server is configured to run only in production environment');
    process.exit(1);
}

const PORT = process.env.PORT || 4000;

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send the socket ID to the client (used as unique peer ID)
    socket.emit("yourID", socket.id);

    // Relay a call request
    socket.on("callUser", (data) => {
        io.to(data.userToCall).emit("incomingCall", { 
            from: data.from, 
            signal: data.signal 
        });
    });

    // Relay the answer back to the caller
    socket.on("answerCall", (data) => {
        io.to(data.to).emit("callAccepted", data.signal);
    });

    // Handle ICE candidate exchange
    socket.on("sendICECandidate", (data) => {
        io.to(data.to).emit("receiveICECandidate", data.candidate);
    });

    // Handle call end
    socket.on("endCall", (data) => {
        io.to(data.to).emit("callEnded");
    });

    // Handle screen share start
    socket.on("startScreenShare", (data) => {
        console.log(`📺 Screen sharing started by ${data.from}`);
        io.to(data.to).emit("screenShareStarted", { from: data.from });
    });

    // Handle screen share stop
    socket.on("stopScreenShare", (data) => {
        console.log(`🛑 Screen sharing stopped by ${data.from}`);
        io.to(data.to).emit("screenShareStopped");
    });

    // Chat message handler for text messages
    socket.on("sendMessage", (data) => {
        console.log(`Forwarding message from ${data.from} to ${data.to}: ${data.text}`);
        io.to(data.to).emit("message", data);
    });
    
    // File share handler
    socket.on("sendFile", (data) => {
        console.log(`Forwarding file from ${data.from} to ${data.to}: ${data.fileName}`);
        io.to(data.to).emit("message", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
