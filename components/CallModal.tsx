'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { FaPhone, FaVideo, FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaClosedCaptioning } from 'react-icons/fa';
import { setTriggerCallModal } from './MessageInput';

const WORKER_URL = process.env.NEXT_PUBLIC_WORDBRIDGE_WORKER_URL || 'https://wordbridge-ai.shaikabduljaleel1214.workers.dev';

interface CallModalProps {
  callType?: 'audio' | 'video';
  callerId?: string;
  callerName?: string;
}

export default function CallModal() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { selectedChat } = useChat();
  const [call, setCall] = useState<{
    type: 'audio' | 'video';
    callerId: string;
    callerName: string;
    isIncoming: boolean;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [transcriptOn, setTranscriptOn] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<{ text: string; translated?: string }[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const transcriptRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptChunksRef = useRef<Blob[]>([]);
  const transcriptIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Expose function to trigger call modal
  useEffect(() => {
    setTriggerCallModal((type, isIncoming, callerId, callerName) => {
      if (selectedChat) {
        const otherUser = selectedChat.participants.find((p) => p._id !== user?._id) || selectedChat.participants[0];
        const callData = {
          type,
          callerId: callerId || (isIncoming ? callerId : otherUser._id) || '',
          callerName: callerName || (isIncoming ? callerName : otherUser.name) || 'User',
          isIncoming,
        };
        console.log('Setting call state:', callData);
        setCall(callData);
        
        // The call will be auto-started by the useEffect hook
      }
    });

    return () => {
      setTriggerCallModal(null);
    };
  }, [selectedChat, user]);

  // Auto-start call when call state is set for outgoing calls
  useEffect(() => {
    if (call && !call.isIncoming && socket && selectedChat && !peerConnectionRef.current) {
      console.log('Auto-starting outgoing call');
      const timer = setTimeout(() => {
        startCall(call.type, true).catch((error) => {
          console.error('Error auto-starting call:', error);
        });
      }, 100); // Small delay to ensure state is set
      
      return () => clearTimeout(timer);
    }
  }, [call, socket, selectedChat]);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { type: 'audio' | 'video'; callerId: string; callerName: string }) => {
      setCall({
        type: data.type,
        callerId: data.callerId,
        callerName: data.callerName,
        isIncoming: true,
      });
    };

    const handleCallAccepted = async (data: { type: 'audio' | 'video'; callerId: string }) => {
      console.log('Call accepted by receiver');
      // The call is already set, just mark it as accepted
      setCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isIncoming: false,
        };
      });
      // The caller's startCall should already have created the offer
    };

    const handleCallEnded = () => {
      endCall();
    };

    const handleCallRejected = () => {
      endCall();
    };

    const handleCallOffer = async (data: { offer: RTCSessionDescriptionInit; type: 'audio' | 'video'; from: string }) => {
      console.log('Received call offer from:', data.from, 'Current call:', call);
      
      // Handle offer for incoming calls (receiver side)
      // The call should already be set when incomingCall event was received
      if (call && call.isIncoming && call.callerId === data.from) {
        try {
          // Ensure we have a peer connection (should be created when acceptCall was called)
          if (!peerConnectionRef.current) {
            console.log('Creating peer connection for incoming call offer');
            await startCall(data.type, false);
          }

          const peerConnection = peerConnectionRef.current;
          if (!peerConnection) {
            console.error('No peer connection available after startCall');
            return;
          }

          // Set remote description and create answer
          console.log('Setting remote description from offer');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          console.log('Sending call answer to:', data.from);
          if (socket) {
            socket.emit('callAnswer', {
              answer,
              to: data.from,
            });
          }
        } catch (error) {
          console.error('Error handling call offer:', error);
          alert('Failed to handle call offer: ' + (error as Error).message);
        }
      } else {
        console.log('Ignoring call offer - call state mismatch. Call:', call, 'From:', data.from, 'Expected caller:', call?.callerId);
      }
    };

    const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      console.log('Received call answer from:', data.from);
      if (!peerConnectionRef.current) {
        console.error('No peer connection when receiving answer');
        return;
      }
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Call answer set successfully - connection should be established');
      } catch (error) {
        console.error('Error setting remote description:', error);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      if (!peerConnectionRef.current) {
        console.log('No peer connection when receiving ICE candidate');
        return;
      }
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('ICE candidate added successfully');
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };

    socket.on('incomingCall', handleIncomingCall);
    socket.on('callAccepted', handleCallAccepted);
    socket.on('callEnded', handleCallEnded);
    socket.on('callRejected', handleCallRejected);
    socket.on('callOffer', handleCallOffer);
    socket.on('callAnswer', handleCallAnswer);
    socket.on('iceCandidate', handleIceCandidate);

    return () => {
      socket.off('incomingCall', handleIncomingCall);
      socket.off('callAccepted', handleCallAccepted);
      socket.off('callEnded', handleCallEnded);
      socket.off('callRejected', handleCallRejected);
      socket.off('callOffer', handleCallOffer);
      socket.off('callAnswer', handleCallAnswer);
      socket.off('iceCandidate', handleIceCandidate);
    };
  }, [socket, call, selectedChat, user]);

  const startCall = async (type: 'audio' | 'video', shouldCreateOffer: boolean = false) => {
    try {
      // Clean up any existing connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });

      localStreamRef.current = stream;

      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = (event) => {
        console.log('Received remote track');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setIsConnected(true);
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
          setIsConnected(true);
        } else if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
          console.error('ICE connection failed');
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log('Peer connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true);
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && call && selectedChat) {
          const targetId = call.isIncoming 
            ? call.callerId 
            : (selectedChat.participants.find(p => p._id !== user?._id)?._id || call.callerId);
          if (targetId) {
            socket.emit('iceCandidate', {
              candidate: event.candidate,
              to: targetId.toString(),
            });
          }
        }
      };

      // Create offer if we're initiating (outgoing call)
      if (shouldCreateOffer && selectedChat && socket) {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          console.log('Sending call offer for chat:', selectedChat._id);
          socket.emit('callOffer', {
            chatId: selectedChat._id.toString(),
            offer,
            type,
          });
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      }

      setIsConnected(true);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Failed to access camera/microphone. Please check permissions.');
      endCall();
    }
  };

  const acceptCall = async () => {
    if (!call || !socket) return;

    console.log('Accepting call, starting peer connection');
    
    // Emit accept call first
    socket.emit('acceptCall', {
      callerId: call.callerId,
      type: call.type,
    });

    // Start the call to set up peer connection
    // The offer will be handled by handleCallOffer when it arrives
    await startCall(call.type, false);
  };

  const rejectCall = () => {
    if (socket && call) {
      socket.emit('rejectCall', {
        callerId: call.callerId,
      });
    }
    endCall();
  };

  const endCall = () => {
    setTranscriptLines([]);
    setTranscriptOn(false);
    if (transcriptIntervalRef.current) {
      clearInterval(transcriptIntervalRef.current);
      transcriptIntervalRef.current = null;
    }
    if (transcriptRecorderRef.current && transcriptRecorderRef.current.state !== 'inactive') {
      transcriptRecorderRef.current.stop();
    }
    transcriptRecorderRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (socket && call) {
      const targetId = call.isIncoming ? call.callerId : (selectedChat?.participants.find(p => p._id !== user?._id)?._id);
      socket.emit('endCall', {
        receiverId: targetId,
      });
    }

    setCall(null);
    setIsConnected(false);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const otherParticipant = selectedChat?.participants?.find((p) => p._id !== user?._id);
  const targetLangCode = (otherParticipant as any)?.preferredLanguage || 'en';

  const toggleTranscript = async () => {
    if (transcriptOn) {
      if (transcriptIntervalRef.current) {
        clearInterval(transcriptIntervalRef.current);
        transcriptIntervalRef.current = null;
      }
      if (transcriptRecorderRef.current && transcriptRecorderRef.current.state !== 'inactive') {
        transcriptRecorderRef.current.stop();
      }
      transcriptRecorderRef.current = null;
      setTranscriptOn(false);
      return;
    }

    if (!localStreamRef.current || !isConnected) return;

    try {
      const recorder = new MediaRecorder(localStreamRef.current, { mimeType: 'audio/webm' });
      transcriptRecorderRef.current = recorder;
      transcriptChunksRef.current = [];

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          transcriptChunksRef.current.push(e.data);
          const blob = new Blob(transcriptChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            if (!base64 || base64.length < 100) return;
            try {
              const transRes = await fetch(`${WORKER_URL}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64, sourceLang: 'auto' }),
              });
              if (transRes.ok) {
                const { text } = await transRes.json();
                if (text?.trim()) {
                  const transResp = await fetch(`${WORKER_URL}/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, targetLang: targetLangCode }),
                  });
                  const transData = transResp.ok ? await transResp.json() : {};
                  setTranscriptLines((prev) => [...prev, { text, translated: transData.translatedText }]);
                }
              }
            } catch {
              // Ignore errors
            }
          };
          reader.readAsDataURL(blob);
        }
      };

      recorder.start(5000);
      transcriptIntervalRef.current = setInterval(() => {
        if (recorder.state === 'recording') recorder.requestData();
      }, 5000);
      setTranscriptOn(true);
    } catch (e) {
      console.error('Transcript start failed:', e);
    }
  };

  useEffect(() => {
    return () => {
      if (transcriptIntervalRef.current) clearInterval(transcriptIntervalRef.current);
      if (transcriptRecorderRef.current && transcriptRecorderRef.current.state !== 'inactive') {
        transcriptRecorderRef.current.stop();
      }
    };
  }, []);

  if (!call) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
      <div className="relative w-full h-full flex flex-col">
        {/* Remote Video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${call.type === 'audio' ? 'hidden' : ''}`}
        />

        {/* Local Video */}
        {call.type === 'video' && (
          <div className="absolute top-4 right-4 w-44 h-32 rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Call Info */}
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <div className="w-28 h-28 rounded-full bg-app-primary flex items-center justify-center mb-4 text-3xl font-semibold ring-4 ring-white/10">
              {call.callerName && call.callerName.length > 0 ? call.callerName.charAt(0).toUpperCase() : 'U'}
            </div>
            <h2 className="text-2xl font-semibold mb-2">{call.callerName || 'User'}</h2>
            <p className="text-gray-300">
              {call.isIncoming ? 'Incoming' : 'Calling'} {call.type} call
            </p>
          </div>
        )}

        {/* Live transcript panel */}
        {transcriptOn && transcriptLines.length > 0 && (
          <div className="absolute bottom-28 left-4 right-4 max-h-32 overflow-y-auto bg-black/60 backdrop-blur rounded-xl p-3 text-white text-sm border border-white/10">
            {transcriptLines.map((line, i) => (
              <div key={i} className="mb-1">
                <span className="text-gray-300">{line.text}</span>
                {line.translated && line.translated !== line.text && (
                  <span className="block text-indigo-300">→ {line.translated}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
          {call.isIncoming && !isConnected && (
            <>
              <button
                onClick={rejectCall}
                className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors"
                title="Reject"
              >
                <FaPhoneSlash className="w-6 h-6" />
              </button>
              <button
                onClick={acceptCall}
                className="w-14 h-14 rounded-full bg-app-primary flex items-center justify-center text-white hover:bg-app-primary-dark transition-colors shadow-lg"
                title="Accept"
              >
                {call.type === 'video' ? (
                  <FaVideo className="w-6 h-6" />
                ) : (
                  <FaPhone className="w-6 h-6" />
                )}
              </button>
            </>
          )}

          {!call.isIncoming && !isConnected && (
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors"
              title="Cancel Call"
            >
              <FaPhoneSlash className="w-6 h-6" />
            </button>
          )}

          {isConnected && (
            <>
              <button
                onClick={toggleTranscript}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${
                  transcriptOn ? 'bg-app-primary' : 'bg-white/20 hover:bg-white/30'
                }`}
                title={transcriptOn ? 'Turn off transcript' : 'Live transcript'}
              >
                <FaClosedCaptioning className="w-6 h-6" />
              </button>
              <button
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${
                  isMuted ? 'bg-rose-500 hover:bg-rose-600' : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {isMuted ? (
                  <FaMicrophoneSlash className="w-6 h-6" />
                ) : (
                  <FaMicrophone className="w-6 h-6" />
                )}
              </button>
              {call.type === 'video' && (
                <button
                  onClick={toggleVideo}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${
                    isVideoOff ? 'bg-rose-500 hover:bg-rose-600' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <FaVideo className="w-6 h-6" />
                </button>
              )}
              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center text-white hover:bg-rose-600 transition-colors"
              >
                <FaPhoneSlash className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
