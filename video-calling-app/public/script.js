const socket = io();
const peer = new Peer();

peer.on("open", (id) => {
    console.log("My peer ID is:", id);
});

document.getElementById("callButton").addEventListener("click", () => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        document.getElementById("localVideo").srcObject = stream;
    });
});
