const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

const PORT = 4000;

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

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
