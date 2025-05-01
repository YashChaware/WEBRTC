// App.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useBreakpointValue } from '@chakra-ui/react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import process from 'process';
import {
  ChakraProvider,
  Flex,
  Box,
  Text,
  Textarea,
  HStack,  InputGroup, InputRightElement,
  Button,
  IconButton,
  Input,
  Divider,
  useToast,
  extendTheme
} from '@chakra-ui/react';
import {
  FaVideo,
  FaMicrophone,
  FaPhoneSlash,
  FaPhone,
  FaDesktop,
  FaUpload,
} from 'react-icons/fa';
import { FiSend } from 'react-icons/fi';
import './App.css'; // Optional styling

window.process = process;
const socket = io('https://webrtc-app-97p9.onrender.com', { 
    transports: ['websocket', 'polling'],
    secure: true,
    rejectUnauthorized: false,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
});

// Optional custom Chakra UI theme (dark mode)
const customTheme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

function App() {
  const myVideoRef = useRef();
  const peerVideoRef = useRef();
  const connectionRef = useRef(null);
  const toast = useToast();
  const floatingVideoProps = useBreakpointValue({
    base: { position: 'static' }, // not absolutely positioned on small screens
    md: { position: 'absolute', bottom: '20px', right: '20px' },
  });

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

  // 1) Initialize Media & Sockets
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream;

        // Disable video/audio initially
        mediaStream.getVideoTracks().forEach((track) => (track.enabled = false));
        mediaStream.getAudioTracks().forEach((track) => (track.enabled = false));
        setIsVideoOn(false);
        setIsAudioOn(false);
      })
      .catch((error) => console.error('Error accessing media:', error));

    socket.on('yourID', (id) => {
      console.log('User ID received:', id);
      setUserId(id);
    });

    socket.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('yourID');
      socket.off('message');
    };
  }, []);

  // 2) Handle Incoming Calls
  const handleIncomingCall = useCallback(
    ({ from, signal }) => {
      if (isCallAccepted) {
        socket.emit('rejectCall', { to: from });
        return;
      }
      setIncomingCallInfo({ isSomeoneCalling: true, from, signal });
    },
    [isCallAccepted]
  );

  const handleCallAccepted = useCallback((signal) => {
    setIsCallAccepted(true);
    if (connectionRef.current) {
      connectionRef.current.signal(signal);
    }
  }, []);

  const destroyConnection = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    setIsCallAccepted(false);
    setIncomingCallInfo({});
  }, []);

  // 3) Register Socket Listeners
  useEffect(() => {
    socket.on('incomingCall', handleIncomingCall);
    socket.on('callAccepted', handleCallAccepted);
    socket.on('callEnded', destroyConnection);

    // Stop Screen Share event
    socket.on('stopScreenShare', () => {
      setIsScreenSharing(false);
      toggleVideo();
    });

    return () => {
      socket.off('incomingCall', handleIncomingCall);
      socket.off('callAccepted', handleCallAccepted);
      socket.off('callEnded', destroyConnection);
      socket.off('stopScreenShare');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleIncomingCall, handleCallAccepted, destroyConnection]);

  // 4) Call & Answer & End
  const initiateCall = () => {
    if (!userToCall.trim()) {
      toast({ title: 'Enter User ID to initiate a call', status: 'warning' });
      return;
    }
    const peer = new SimplePeer({ initiator: true, trickle: false, stream });
    peer.on('signal', (signal) => {
      socket.emit('callUser', { userToCall, from: userId, signal });
    });
    peer.on('stream', (remoteStream) => {
      if (peerVideoRef.current) peerVideoRef.current.srcObject = remoteStream;
    });
    peer.on('close', destroyConnection);
    connectionRef.current = peer;
  };

  const answerCall = () => {
    setIsCallAccepted(true);
    const peer = new SimplePeer({ initiator: false, trickle: false, stream });
    peer.on('signal', (signal) => {
      socket.emit('answerCall', { signal, to: incomingCallInfo.from });
    });
    peer.on('stream', (remoteStream) => {
      if (peerVideoRef.current) peerVideoRef.current.srcObject = remoteStream;
    });
    peer.signal(incomingCallInfo.signal);
    peer.on('close', destroyConnection);
    connectionRef.current = peer;
  };

  const endCall = () => {
    socket.emit('endCall', { to: incomingCallInfo.from });
    destroyConnection();
  };

  // 5) Camera & Mic Toggle
  const toggleVideo = useCallback(() => {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
    }
  }, [stream, isVideoOn]);

  const toggleAudio = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => (track.enabled = !isAudioOn));
    setIsAudioOn(!isAudioOn);
  };

  // 6) Screen Share Start/Stop
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => stopScreenShare();
      if (connectionRef.current) {
        connectionRef.current.replaceTrack(
          stream.getVideoTracks()[0],
          screenTrack,
          stream
        );
      }
      setIsScreenSharing(true);
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  };

  const stopScreenShare = () => {
    setIsScreenSharing(false);
    if (connectionRef.current) {
      const webcamTrack = stream.getVideoTracks()[0];
      connectionRef.current.replaceTrack(
        connectionRef.current.streams[0].getVideoTracks()[0],
        webcamTrack,
        stream
      );
      socket.emit('stopScreenShare', { to: userToCall });
    }
  };

  // 7) Chat & File Sharing
  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const recipientId = userToCall || incomingCallInfo.from;
    const messageData = { from: userId, to: recipientId, text: newMessage };
    socket.emit('sendMessage', messageData);
    setMessages((prev) => [...prev, messageData]);
    setNewMessage('');
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const recipientId = userToCall || incomingCallInfo.from;
      const fileData = {
        from: userId,
        to: recipientId,
        fileName: file.name,
        fileType: file.type,
        data: reader.result,
      };
      socket.emit('sendFile', fileData);
      setMessages((prev) => [...prev, fileData]);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFileUpload(droppedFiles[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // -------------------
  // Render Sections
  // -------------------

  // Right Column: Chat
  const renderChatSection = () => (
    <Flex
      direction="column"
      flex={1}
      bg="gray.800"
      borderRadius="md"
      p={4}
      minH="400px"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      width={['100%', '20%']}
      maxWidth={['100%', '400px']}
    >
      <Text fontWeight="bold" mb={2}>Chat</Text>
      <Flex
        direction="column"
        flex="1"
        overflowY="auto"
        mb={2}
        p={2}
        borderWidth="1px"
        borderColor="gray.700"
        borderRadius="md"
      >
        {messages.map((msg, index) => (
          <Flex key={index} mb={2} direction="column" fontSize="sm">
            <Text fontWeight="bold">{msg.from}:</Text>
            {msg.text ? (
              <Text ml={4} whiteSpace="pre-line">{msg.text}</Text>
            ) : (
              <Box ml={4}>
                sent a file: <a href={msg.data} download={msg.fileName}>{msg.fileName}</a>
                {msg.fileType?.startsWith('image/') && (
                  <Box mt={1}>
                    <img src={msg.data} alt={msg.fileName} style={{ maxWidth: '100px' }} />
                  </Box>
                )}
              </Box>
            )}
          </Flex>
        ))}
      </Flex>

      {/* Chat Input */}
      <HStack mt={2}>
        <InputGroup position="relative">
  <Textarea
    placeholder="Type a message..."
    value={newMessage}
    onChange={(e) => setNewMessage(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }}
    bg="gray.700"
    color="white"
    resize="none"
    rows={2}
    pr="3rem" // leave space for the icon
  />

  <InputRightElement width="3rem">
    <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
      <FaUpload />
    </label>
    <input
      type="file"
      id="fileInput"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
      }}
    />
  </InputRightElement>
</InputGroup>
<IconButton
          icon={<FiSend />}
          colorScheme="blue"
          onClick={sendMessage}
          aria-label="Send"
        />
      </HStack>
    </Flex>
  );

  const renderCallSection = () => {
    return isCallAccepted ? (
      <Flex
        direction="column"
        flex={1}
        bg="gray.800"
        borderRadius="md"
        p={4}
        align="center"
        minH="400px"
        position='relative'
      >
        <Box
          position={{md: 'absolute', base:'static'}}
          width={{md:'300px' , base:'full'}}
          bg="black"
          borderRadius="md"
          display="flex"
          alignItems="end"
          justifyContent="end"
          right={{md: '20px'}}
          bottom={{md: '20px'}}
        >
          {/* My Video */}
          <video
            ref={myVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              borderRadius: '8px',
              objectFit: 'cover',
              maxWidth: '1000px',
            }}
          />
        </Box>
        <Text fontWeight="bold" mb={2}>
          Your Video
        </Text>
        <Divider mb={4} />
        <Box
          bg="black"
          borderRadius="md"
          w="full"
          flex="1"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {/* Peer Video */}
          <video
            ref={peerVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              borderRadius: '8px',
              objectFit: 'cover',
              maxWidth: '1000px',
            }}
          />
        </Box>
      </Flex>
    ) : (
      <Flex
        direction="column"
        flex={1}
        bg="gray.800"
        borderRadius="md"
        p={4}
        align="center"
        minH="400px"
      >
        <Box
          bg="black"
          borderRadius="md"
          w="full"
          flex="1"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <video
            ref={myVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              borderRadius: '8px',
              objectFit: 'cover',
              maxWidth: '1000px',
            }}
          />
        </Box>
        <Text fontWeight="bold" mb={2}>
          Your Video
        </Text>
        <Divider mb={4} />
        {/* <Flex
          direction="column"
          align="center"
          justify="center"
          w="full"
          h="150px"
          bg="gray.700"
          borderRadius="md"
        >
          <Text color="gray.400">Waiting for a call...</Text> */}
          {incomingCallInfo?.isSomeoneCalling && (
            <Flex
            direction="column"
            align="center"
            justify="center"
            w="full"
            h="150px"
            bg="gray.700"
            borderRadius="md"
          >
            <HStack mt={2} gap='50px'>
              <Button colorScheme="green" leftIcon={<FaPhone />} onClick={answerCall}>
                Accept
              </Button>
              <Button colorScheme="red" leftIcon={<FaPhoneSlash />} onClick={destroyConnection}>
                Reject
              </Button>
            </HStack>
            </Flex>
          )}

      </Flex>
    );
  };
  
  
  

  // Bottom Action Buttons
  const renderActionButtons = () => (
    <HStack spacing={4} mt={4} wrap="wrap" justify="center">
      <Button
        colorScheme={isVideoOn ? 'green' : 'red'}
        leftIcon={<FaVideo />}
        onClick={toggleVideo}
      >
        {isVideoOn ? 'Camera On' : 'Camera Off'}
      </Button>
      <Button
        colorScheme={isAudioOn ? 'green' : 'red'}
        leftIcon={<FaMicrophone />}
        onClick={toggleAudio}
      >
        {isAudioOn ? 'Mic on' : 'Mic '}
      </Button>
      {isCallAccepted && (
        <Button
          colorScheme={isScreenSharing ? 'red' : 'blue'}
          leftIcon={<FaDesktop />}
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        >
          {isScreenSharing ? 'Stop Share' : 'Share Screen'}
        </Button>
      )}

      {isCallAccepted && (
        <Button colorScheme="red" leftIcon={<FaPhoneSlash />} onClick={endCall}>
          End Call
        </Button>
      )}

    </HStack>
  );

  // Top Header
  const renderHeader = () => (
    <Flex
      align="center"
      justify="space-between"
      mb={4}
      wrap="wrap"
      gap={4}
    >
      <Text fontSize="lg" fontWeight="bold">
        Video Chat & File Sharing App
      </Text>

      <HStack>
        <Text fontSize="sm" color="gray.300">
          Your User ID:
        </Text>
        <Text fontSize="sm" fontWeight="bold" color="blue.300">
          {userId || 'Fetching...'}
        </Text>
      </HStack>

      <HStack>
        <Input
          placeholder="Enter User ID to Call"
          value={userToCall}
          onChange={(e) => setUserToCall(e.target.value)}
          bg="gray.700"
          w="200px"
        />
        <Button
          colorScheme="blue"
          onClick={initiateCall}
          leftIcon={<FaPhone />}
        >
          Call
        </Button>
      </HStack>
    </Flex>
  );

  return (
    <ChakraProvider theme={customTheme}>
      <Flex direction="column" minH="100vh" p={4} bg="gray.900" color="white">
        {/* Header */}
        {renderHeader()}

        {/* 3 Columns: Chat | Call | Media */}
        <Flex flex="1" gap={4} direction={['column', 'row']} mb={4}>
          {renderCallSection()}
          {isCallAccepted ? renderChatSection() : <></>}
          {/* {renderMediaSection()} */}
        </Flex>

        {/* Bottom Buttons */}
        <Flex justify="center">{renderActionButtons()}</Flex>
      </Flex>
    </ChakraProvider>
  );
}

export default App;