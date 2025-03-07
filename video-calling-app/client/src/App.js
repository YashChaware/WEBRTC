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

    return () => {
      socket.off("yourID");
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

  // Handle WebSocket Events
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
  const toggleVideo = () => {
    if (!stream) return;
  
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !isVideoOn;  // Enable/disable instead of stopping
      setIsVideoOn(!isVideoOn);
    }
  };
  

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

// ✅ Stop Screen Sharing
const stopScreenShare = () => {
  setIsScreenSharing(false);
  toggleVideo(); // Switch back to webcam video
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
    </div>
  );
}

export default App;