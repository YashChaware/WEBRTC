import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import './App.css';
import process from "process";
window.process = process;

// Ensure correct WebSocket connection
const socket = io('ws://localhost:4000', { transports: ["websocket"] });

function App() {
  const myVideoRef = useRef();
  const peerVideoRef = useRef();
  const connectionRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [userId, setUserId] = useState('');
  const [userToCall, setUserToCall] = useState('');
  const [isCallAccepted, setIsCallAccepted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [incomingCallInfo, setIncomingCallInfo] = useState({});

  // Mic & Camera State
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    // Get user media (camera & mic)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        setStream(mediaStream);

        // Assign stream to video element
        if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream;

        // Disable video and audio tracks initially
        mediaStream.getVideoTracks().forEach(track => track.enabled = false);
        mediaStream.getAudioTracks().forEach(track => track.enabled = false);

        // Set initial state
        setIsVideoOn(false);
        setIsAudioOn(false);
      })
      .catch((error) => console.error('Error accessing media devices:', error));

    // Listen for user ID from backend
    socket.on('yourID', (id) => {
      console.log("User ID received:", id);
      setUserId(id);
    });

    // Listen for chat messages
    socket.on('message', (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
    });

    return () => {
      socket.off("yourID");
      socket.off("message");
    };
  }, []);

  // Handle Incoming Call
  const handleIncomingCall = useCallback(({ from, signal }) => {
    if (isCallAccepted) {
      socket.emit('rejectCall', { to: from });
      return;
    }
    setIncomingCallInfo({ isSomeoneCalling: true, from, signal });
  }, [isCallAccepted]);

  // Handle Call Acceptance
  const handleCallAccepted = useCallback((signal) => {
    setIsCallAccepted(true);
    if (connectionRef.current) {
      connectionRef.current.signal(signal);
    }
  }, []);

  // Destroy Connection
  const destroyConnection = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    setIsCallAccepted(false);
    setIncomingCallInfo({});
  }, []);

  // Handle WebSocket Events for calls
  useEffect(() => {
    console.log("Socket connected:", socket.connected);

    socket.on('incomingCall', handleIncomingCall);
    socket.on('callAccepted', handleCallAccepted);
    socket.on('callEnded', destroyConnection);

    return () => {
      socket.off("incomingCall", handleIncomingCall);
      socket.off("callAccepted", handleCallAccepted);
      socket.off("callEnded", destroyConnection);
    };
  }, [handleIncomingCall, handleCallAccepted, destroyConnection]);

  // Initiate Call
  const initiateCall = () => {
    if (!userToCall.trim()) {
      alert('Enter User ID to initiate a call');
      return;
    }

    console.log("Initiating call to:", userToCall);
    const peer = new SimplePeer({ initiator: true, trickle: false, stream });

    peer.on('signal', (signal) => {
      console.log("Sending call signal:", { userToCall, from: userId });
      socket.emit('callUser', { userToCall, from: userId, signal });
    });

    peer.on('stream', (remoteStream) => {
      if (peerVideoRef.current) peerVideoRef.current.srcObject = remoteStream;
    });

    peer.on('close', () => {
      console.log("Peer connection closed.");
      destroyConnection();
    });

    connectionRef.current = peer;
  };

  // Answer Call
  const answerCall = () => {
    setIsCallAccepted(true);
    const peer = new SimplePeer({ initiator: false, trickle: false, stream });

    peer.on('signal', (signal) => {
      console.log("Answering call with signal:", signal);
      socket.emit('answerCall', { signal, to: incomingCallInfo.from });
    });

    peer.on('stream', (remoteStream) => {
      if (peerVideoRef.current) peerVideoRef.current.srcObject = remoteStream;
    });

    peer.signal(incomingCallInfo.signal);

    peer.on('close', () => {
      console.log("Peer connection closed.");
      destroyConnection();
    });

    connectionRef.current = peer;
  };

  // End Call
  const endCall = () => {
    console.log("Ending call...");
    socket.emit('endCall', { to: incomingCallInfo.from });
    destroyConnection();
  };

  // Toggle Camera
  const toggleVideo = useCallback(() => {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
    }
  }, [stream, isVideoOn]);

  // Toggle Mic
  const toggleAudio = () => {
    if (!stream) return;

    stream.getAudioTracks().forEach(track => (track.enabled = !isAudioOn));
    setIsAudioOn(!isAudioOn);
  };

  // ✅ Start Screen Sharing
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => stopScreenShare(); // Stop when user ends sharing

      if (connectionRef.current) {
        connectionRef.current.replaceTrack(
          stream.getVideoTracks()[0],  // Replace webcam video with screen share
          screenTrack,
          stream
        );
      }

      setIsScreenSharing(true);
    } catch (error) {
      console.error("Error sharing screen:", error);
    }
  };

  // ✅ Stop Screen Sharing (Fixed)
  const stopScreenShare = () => {
    setIsScreenSharing(false);

    if (connectionRef.current) {
      // Switch back to webcam video
      const webcamTrack = stream.getVideoTracks()[0];
      connectionRef.current.replaceTrack(
        connectionRef.current.streams[0].getVideoTracks()[0],  // Remove screen share track
        webcamTrack,
        stream
      );

      // ✅ Notify the other user that screen sharing has stopped
      socket.emit("stopScreenShare", { to: userToCall });
    }
  };

  // ✅ Listen for stopScreenShare event
  useEffect(() => {
    socket.on("stopScreenShare", () => {
      setIsScreenSharing(false);
      toggleVideo(); // Switch back to webcam video
    });

    return () => {
      socket.off("stopScreenShare");
    };
  }, [toggleVideo]);

  // Chat: Render chat UI only when call is active
  const renderChat = () => (
    <div className="chat-container">
      <h3>Chat</h3>
      <div className="chat-box">
        {messages.map((msg, index) => (
          <p key={index}><strong>{msg.from}:</strong> {msg.text}</p>
        ))}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} className='input bg-green'>Send</button>
      </div>
    </div>
  );

  // Chat: Send message handler
  const sendMessage = () => {
    if (newMessage.trim() === '') return;
    // Use userToCall if available; otherwise, fall back to the remote caller's ID
    const recipientId = userToCall || incomingCallInfo.from;
    const messageData = { from: userId, to: recipientId, text: newMessage };
    socket.emit('sendMessage', messageData);
    setMessages((prevMessages) => [...prevMessages, messageData]);
    setNewMessage('');
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Determine the recipient's ID; you may use userToCall if available, or incomingCallInfo.from
      const recipientId = userToCall || incomingCallInfo.from;
      const fileData = {
        from: userId,
        to: recipientId,
        fileName: file.name,
        fileType: file.type,
        data: reader.result, // Base64 encoded file data
      };
      socket.emit('sendFile', fileData);
      // Optionally, update your messages state so the file appears in your chat UI
      setMessages((prev) => [...prev, fileData]);
    };
    reader.readAsDataURL(file);
  };
  

  return (
    <div className="flex flex-col items-center">
      <h2 className='text-center'>Video Calling MERN App</h2>

      <div className='flex flex-col w-300 gap-4'>
        <input
          type="text"
          value={userToCall}
          onChange={(e) => setUserToCall(e.target.value)}
          placeholder="Enter User ID"
          className='input'
        />
        <button onClick={initiateCall} className='input bg-blue'>Call User</button>
      </div>

      <section className='m-4'>My ID: <u><i>{userId}</i></u></section>

      <div className='flex flex-row gap-4 m-4 mb-8'>
        <div>
          <h3 className='text-center'>My Video</h3>
          <video ref={myVideoRef} autoPlay playsInline muted className='video_player' />
        </div>

        {isCallAccepted &&
          <div>
            <h3 className='text-center'>Peer Video</h3>
            <video ref={peerVideoRef} autoPlay playsInline className='video_player' />
          </div>
        }
      </div>

      <div className="flex gap-4">
        <button className={`input ${isVideoOn ? 'bg-red' : 'bg-green'}`} onClick={toggleVideo}>
          {isVideoOn ? 'Turn Off Camera' : 'Turn On Camera'}
        </button>

        <button className={`input ${isAudioOn ? 'bg-red' : 'bg-green'}`} onClick={toggleAudio}>
          {isAudioOn ? 'Mute Mic' : 'Unmute Mic'}
        </button>
      </div>

      {isCallAccepted && (
        <button className={`input ${isScreenSharing ? 'bg-red' : 'bg-green'}`} onClick={isScreenSharing ? stopScreenShare : startScreenShare}>
          {isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
        </button>
      )}

      {isCallAccepted ? (
        <button className='input bg-red mt-4' onClick={endCall}>End Call</button>
      ) : (
        incomingCallInfo?.isSomeoneCalling && (
          <div className='flex flex-col mb-8'>
            <section className='m-4'><u>{incomingCallInfo?.from}</u> is calling</section>
            <button onClick={answerCall} className='input bg-green'>Answer Call</button>
          </div>
        )
      )}

      {/* Render Chat only when call is active */}
      {isCallAccepted && renderChat()}
    </div>
  );
}

export default App;
