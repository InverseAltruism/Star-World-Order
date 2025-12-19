# Voice Chat Implementation Plan

This document outlines the requirements, options, and implementation plan for adding real-time voice chat functionality to Star World Order's Hangout Hub.

## Current State

The Hangout Hub (`app/hangout/HangoutContent.tsx`) already has:
- ✅ Voice chat UI components (`VoiceChatInline`, `VoiceChat`)
- ✅ Database schema for voice sessions and participants (`voice_sessions`, `voice_participants`)
- ✅ API endpoints (`/api/voice`) for session management
- ✅ Mute/unmute/deafen UI controls
- ✅ Participant list display
- ❌ **Missing**: Actual WebRTC audio streaming (currently shows "Coming Soon")

## Requirements

### Functional Requirements
1. Voice chat for Star Skrumpey holders in the Hangout Hub
2. Support for multiple users in the same room
3. Mute/unmute functionality
4. Visual indication of who is speaking
5. Low latency audio (acceptable for casual voice chat)

### Non-Functional Requirements
1. **Budget**: Free or very low cost (self-hosted preferred)
2. **Quality**: Doesn't need to be the best - acceptable for casual voice chat
3. **Scale**: Small community (~10-50 concurrent users max)
4. **Hosting**: Can run on existing NUC server or cloud VPS

---

## Recommended Options (Ranked)

### 🥇 Option 1: PeerJS (Simplest - RECOMMENDED for MVP)

**Best for**: Small communities, quick implementation, minimal server resources

PeerJS is the simplest solution for peer-to-peer WebRTC voice chat. Perfect for Star World Order's small community size.

#### Pros
- ✅ **Extremely simple** to integrate (< 100 lines of code)
- ✅ **Free** - no licensing costs
- ✅ **Minimal server resources** - just a signaling server
- ✅ **NPM package available**: `peerjs`
- ✅ Works directly in the browser

#### Cons
- ❌ P2P mesh topology - not ideal for >10 users in one room
- ❌ No server-side recording
- ❌ Requires TURN server for users behind strict NAT/firewalls

#### Server Requirements
- **PeerJS Server**: Node.js signaling server (very lightweight)
- **TURN Server**: Optional but recommended (can use free services like Metered.ca)

#### Implementation Effort
- **Estimated Time**: 1-2 days
- **Complexity**: Low

#### Cost
- **Free** (self-hosted PeerJS server)
- **TURN**: Free tier available from Metered.ca, Twilio, or self-host coturn

---

### 🥈 Option 2: LiveKit (Best Scalability)

**Best for**: Growing community, high-quality audio, future video support

LiveKit is a modern open-source WebRTC infrastructure designed for real-time audio/video.

#### Pros
- ✅ **SFU architecture** - scales better than P2P for larger rooms
- ✅ **High quality** audio with adaptive bitrate
- ✅ **Open source** - free to self-host
- ✅ **React SDK** available: `@livekit/components-react`
- ✅ Speaking detection built-in
- ✅ Can add video chat later

#### Cons
- ❌ More complex setup than PeerJS
- ❌ Requires more server resources
- ❌ Cloud version has costs (but self-host is free)

#### Server Requirements
- **LiveKit Server**: Docker container or binary
- **Redis**: For distributed deployments (optional for single server)
- **Recommended**: 2 CPU cores, 4GB RAM minimum

#### Implementation Effort
- **Estimated Time**: 2-3 days
- **Complexity**: Medium

#### Cost
- **Self-hosted**: Free
- **LiveKit Cloud**: Free tier (100 monthly active users), then $0.01+/min

---

### 🥉 Option 3: Jitsi Meet (Most Feature-Rich)

**Best for**: Full-featured conferencing, easy deployment

Jitsi is a mature open-source video conferencing platform with voice chat support.

#### Pros
- ✅ **Feature-rich** - chat, screen share, recording, E2E encryption
- ✅ **Easy to deploy** via Docker
- ✅ **Excellent documentation**
- ✅ Can embed via IFrame or use API

#### Cons
- ❌ **Heavy** - designed for video conferencing, overkill for voice-only
- ❌ More server resources needed
- ❌ Less customizable UI (uses Jitsi's UI)

#### Server Requirements
- **Jitsi Server Stack**: Prosody, Jicofo, JVB
- **Recommended**: 4 CPU cores, 8GB RAM
- **Docker Compose** available for easy deployment

#### Implementation Effort
- **Estimated Time**: 1-2 days (if using IFrame embed)
- **Complexity**: Low-Medium

#### Cost
- **Self-hosted**: Free
- **Jitsi as a Service (JaaS)**: Has free tier, then usage-based pricing

---

## Implementation Guide for PeerJS (Recommended)

### Step 1: Install Dependencies

```bash
npm install peerjs
```

### Step 2: Set Up PeerJS Server

Create a simple signaling server that can run alongside the Next.js app.

**Option A**: Use free PeerJS Cloud (simplest, no server needed)
```typescript
// Uses peerjs.com default cloud server
const peer = new Peer();
```

**Option B**: Self-host PeerJS Server
```bash
npm install peer
npx peerjs --port 9000 --key peerjs --path /myapp
```

Or create a custom server (requires `peer` package - different from client `peerjs`):
```bash
# Server-side package (different from client peerjs)
npm install peer
```

```typescript
// server/peer-server.ts
import { PeerServer } from 'peer';

const peerServer = PeerServer({
  port: 9000,
  path: '/peerjs',
  allow_discovery: true
});
```

### Step 3: Implement Voice Chat Hook

Create a new hook for WebRTC voice chat:

```typescript
// lib/hooks/useVoiceChat.ts
import Peer, { MediaConnection } from 'peerjs';
import { useEffect, useRef, useState, useCallback } from 'react';

interface VoiceChatOptions {
  roomId: string;
  userId: string;
  onParticipantJoin?: (peerId: string) => void;
  onParticipantLeave?: (peerId: string) => void;
}

export function useVoiceChat({ roomId, userId, onParticipantJoin, onParticipantLeave }: VoiceChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [participants, setParticipants] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState<Record<string, boolean>>({});
  
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  
  // Initialize peer connection
  const initPeer = useCallback(async () => {
    const peer = new Peer(`${roomId}-${userId}`, {
      // Use free PeerJS cloud or self-hosted server
      // host: 'your-server.com',
      // port: 9000,
      // path: '/peerjs'
    });
    
    peer.on('open', (id) => {
      console.log('Connected to PeerJS with ID:', id);
      setIsConnected(true);
    });
    
    peer.on('call', async (call) => {
      // Answer incoming calls
      if (!localStreamRef.current) {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      call.answer(localStreamRef.current);
      
      call.on('stream', (remoteStream) => {
        playRemoteAudio(call.peer, remoteStream);
      });
      
      connectionsRef.current.set(call.peer, call);
      setParticipants(prev => [...prev, call.peer]);
      onParticipantJoin?.(call.peer);
    });
    
    peerRef.current = peer;
  }, [roomId, userId, onParticipantJoin]);
  
  // Call another peer
  const callPeer = useCallback(async (peerId: string) => {
    if (!peerRef.current || !localStreamRef.current) return;
    
    const call = peerRef.current.call(peerId, localStreamRef.current);
    
    call.on('stream', (remoteStream) => {
      playRemoteAudio(peerId, remoteStream);
    });
    
    connectionsRef.current.set(peerId, call);
    setParticipants(prev => [...prev, peerId]);
  }, []);
  
  // Play remote audio (Note: requires user interaction before calling)
  const playRemoteAudio = (peerId: string, stream: MediaStream) => {
    const audio = new Audio();
    audio.srcObject = stream;
    // Handle potential autoplay restrictions
    audio.play().catch(err => {
      console.warn('Audio autoplay blocked, user interaction required:', err);
    });
    
    // Detect speaking (optional - for visual indicator)
    // Note: In production, share a single AudioContext and implement cleanup
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    let animationFrameId: number;
    const checkSpeaking = () => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setIsSpeaking(prev => ({ ...prev, [peerId]: average > 10 }));
      animationFrameId = requestAnimationFrame(checkSpeaking);
    };
    checkSpeaking();
    
    // TODO: Store animationFrameId and call cancelAnimationFrame() when stream ends
  };
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);
  
  // Join voice chat
  const join = useCallback(async () => {
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Start muted by default
    localStreamRef.current.getAudioTracks()[0].enabled = false;
    await initPeer();
  }, [initPeer]);
  
  // Leave voice chat
  const leave = useCallback(() => {
    connectionsRef.current.forEach(conn => conn.close());
    connectionsRef.current.clear();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerRef.current?.destroy();
    setIsConnected(false);
    setParticipants([]);
  }, []);
  
  return {
    isConnected,
    isMuted,
    participants,
    isSpeaking,
    join,
    leave,
    toggleMute,
    callPeer,
  };
}
```

### Step 4: Update VoiceChatInline Component

Modify the existing `VoiceChatInline` component to use the new hook (after creating useVoiceChat.ts from Step 3):

```typescript
// In app/hangout/HangoutContent.tsx - VoiceChatInline component
// Note: First create lib/hooks/useVoiceChat.ts as shown in Step 3

import { useVoiceChat } from '@/lib/hooks/useVoiceChat';

function VoiceChatInline({ address, onlineUsers }: { address: string | undefined; onlineUsers: OnlineUser[] }) {
  const {
    isConnected,
    isMuted,
    participants,
    isSpeaking,
    join,
    leave,
    toggleMute,
  } = useVoiceChat({
    roomId: 'swo-hangout',
    userId: address || 'anonymous',
  });
  
  // ... rest of component with actual WebRTC functionality
}
```

### Step 5: TURN Server Setup (Optional but Recommended)

For users behind strict firewalls, set up a TURN server:

**Option A**: Use free TURN service
- [Metered.ca](https://www.metered.ca/stun-turn) - Free tier available
- [Twilio](https://www.twilio.com/stun-turn) - Free credits for new accounts

**Option B**: Self-host coturn
```bash
# Install coturn
sudo apt install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=swo:your-secret-password
realm=starworldorder.com

# Start coturn
sudo systemctl start coturn
```

---

## Server Architecture

### Minimal Setup (PeerJS)

```
┌─────────────────────────────────────────────────┐
│                   NUC Server                     │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ Next.js App  │    │ PeerJS Signaling     │   │
│  │ (Port 3080)  │    │ Server (Port 9000)   │   │
│  └──────────────┘    └──────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ coturn TURN Server (Port 3478) - Optional│   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                         │
                         │ WebRTC (P2P after signaling)
                         ▼
              ┌─────────────────────┐
              │   Browser Clients   │
              │   (Star Holders)    │
              └─────────────────────┘
```

### Scalable Setup (LiveKit)

```
┌─────────────────────────────────────────────────┐
│                   Cloud Server                   │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ Next.js App  │    │ LiveKit Server       │   │
│  │ (Port 3080)  │    │ (Port 7880)          │   │
│  └──────────────┘    └──────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ Redis (for LiveKit scaling) - Optional   │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                         │
                         │ WebRTC via SFU
                         ▼
              ┌─────────────────────┐
              │   Browser Clients   │
              │   (Star Holders)    │
              └─────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Basic Voice Chat (PeerJS)
- [ ] Install `peerjs` npm package
- [ ] Create `useVoiceChat` hook with basic functionality
- [ ] Update `VoiceChatInline` component to use hook
- [ ] Test P2P audio between 2 users
- [ ] Add speaking detection visualization
- [ ] Test with 3-5 concurrent users

### Phase 2: Production Hardening
- [ ] Set up self-hosted PeerJS signaling server
- [ ] Configure TURN server for NAT traversal
- [ ] Add error handling and reconnection logic
- [ ] Add audio device selection UI
- [ ] Test on mobile browsers

### Phase 3: Optional Enhancements
- [ ] Add noise suppression (using Web Audio API)
- [ ] Add echo cancellation settings
- [ ] Implement voice activity detection (VAD)
- [ ] Add "push to talk" option
- [ ] Consider migration to LiveKit for scaling

---

## Quick Start Commands

```bash
# Install dependencies
npm install peerjs

# Optional: Install PeerJS server for self-hosting
npm install peer

# Run PeerJS server locally
npx peerjs --port 9000 --key peerjs --path /myapp
```

---

## Resources

- [PeerJS Documentation](https://peerjs.com/docs/)
- [PeerJS GitHub](https://github.com/peers/peerjs)
- [LiveKit Documentation](https://docs.livekit.io/)
- [WebRTC API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [coturn TURN Server](https://github.com/coturn/coturn)
- [Metered Free TURN](https://www.metered.ca/stun-turn)

---

## Cost Summary

| Solution | Hosting Cost | Service Cost | Total |
|----------|--------------|--------------|-------|
| PeerJS (self-hosted) | NUC power | Free | **Free** |
| PeerJS + Metered TURN | NUC power | Free tier | **Free** |
| LiveKit (self-hosted) | VPS ~$5-10/mo | Free | **$5-10/mo** |
| LiveKit Cloud | None | Free tier (100 MAU) | **Free** |
| Jitsi (self-hosted) | VPS ~$10-20/mo | Free | **$10-20/mo** |

---

## Recommendation

For Star World Order's current needs (small community, quality doesn't need to be the best):

**Start with PeerJS** - It's the simplest, fastest to implement, and completely free. If the community grows significantly (>20 concurrent voice users), consider migrating to LiveKit.

The existing UI and database schema don't need changes - just add the WebRTC layer using the hooks pattern described above.
