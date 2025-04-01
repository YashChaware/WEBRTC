const socket = io();
const peer = new Peer();

peer.on("open", (id) => {
    console.log("My peer ID is:", id);
    socket.emit("yourID", id);
});

document.getElementById("callButton").addEventListener("click", () => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        document.getElementById("localVideo").srcObject = stream;
    });
});

// Handle incoming chat messages
typeMessage = document.getElementById("messageInput");
document.getElementById("sendButton").addEventListener("click", () => {
    const message = typeMessage.value;
    const to = "recipientPeerID"; // Replace with actual recipient ID
    socket.emit("sendMessage", { from: peer.id, to, message });
    displayMessage("You", message);
    typeMessage.value = "";
});

socket.on("receiveMessage", (data) => {
    displayMessage(data.from, data.message);
});

function displayMessage(sender, message) {
    const chatBox = document.getElementById("chatBox");
    const msgElement = document.createElement("p");
    msgElement.textContent = `${sender}: ${message}`;
    chatBox.appendChild(msgElement);
}
