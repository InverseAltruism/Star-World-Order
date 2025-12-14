# Issue #1: Habbo Hotel-Style Pixel Art Lobby

## 🎮 Feature Overview

Create an immersive **Habbo Hotel-style pixel art lobby** as the social hub for Star World Order. This will replace/enhance the current Hangout Hub with a fully interactive 2D isometric space where Star Skrumpey holders can meet, chat, and socialize.

## 🎯 Goals

- Create a nostalgic, pixel-perfect 2D social space
- Enable real-time multiplayer interaction
- Provide click-to-move navigation with pathfinding
- Display chat bubbles above avatars
- Support mobile and desktop responsive design
- Maintain crisp pixel rendering at all screen sizes

## 🛠️ Tech Choice: PixiJS

### Why PixiJS?

| Feature | PixiJS | Phaser | Canvas 2D |
|---------|--------|--------|-----------|
| **Performance** | ✅ WebGL with Canvas fallback | ✅ WebGL | ⚠️ CPU-bound |
| **Bundle Size** | ✅ ~300KB gzipped | ❌ ~800KB+ | ✅ Native |
| **React Integration** | ✅ @pixi/react available | ⚠️ Requires wrapper | ✅ Native |
| **Pixel Art Support** | ✅ `SCALE_MODES.NEAREST` | ✅ Built-in | ⚠️ Manual |
| **Sprite Batching** | ✅ Automatic | ✅ Built-in | ❌ Manual |
| **Learning Curve** | ✅ Simple API | ⚠️ Game-engine paradigm | ✅ Simple |
| **Maintenance** | ✅ Active (v7/v8) | ✅ Active | ✅ N/A |

**Verdict**: PixiJS provides the best balance of performance, size, and flexibility for our use case. We're building a social lobby, not a full game engine.

### Alternative Consideration: Custom Canvas2D

For simpler implementations, a custom Canvas2D renderer could work:
- **Pros**: Zero dependencies, smaller bundle, full control
- **Cons**: Manual sprite batching, no WebGL acceleration, more code to maintain
- **Recommendation**: Start with PixiJS, consider Canvas2D fallback for low-end devices

## 🏗️ Architecture Plan

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    STAR LOBBY SYSTEM                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   RENDER    │  │    INPUT    │  │      MOVEMENT       │ │
│  │   SYSTEM    │  │   SYSTEM    │  │       SYSTEM        │ │
│  │             │  │             │  │                     │ │
│  │ • PixiJS    │  │ • Click     │  │ • Pathfinding       │ │
│  │ • Sprites   │  │ • Touch     │  │ • Collision         │ │
│  │ • Animation │  │ • Keyboard  │  │ • Lerp movement     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │     MAP     │  │     UI      │  │     NETWORK         │ │
│  │   SYSTEM    │  │   SYSTEM    │  │      SYSTEM         │ │
│  │             │  │             │  │                     │ │
│  │ • Tilemap   │  │ • Chat      │  │ • WebSocket         │ │
│  │ • Collision │  │ • Bubbles   │  │ • Presence          │ │
│  │ • Depth     │  │ • HUD       │  │ • Sync              │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1. Render System
- Initialize PixiJS Application with WebGL
- Handle sprite loading and caching
- Manage depth sorting for isometric view
- Apply pixel-perfect scaling (nearest neighbor)

### 2. Input System
- Click-to-move on walkable tiles
- Touch support for mobile
- Keyboard shortcuts (WASD/Arrow keys optional)
- Prevent interaction with non-walkable areas

### 3. Movement System
- A* pathfinding on tile grid
- Smooth interpolated movement (lerp)
- Collision detection with obstacles
- Avatar direction/animation states

### 4. Map System
- Isometric tilemap (2:1 diamond ratio)
- Tile types: floor, wall, furniture, decoration
- Collision layer for pathfinding
- Support for multiple rooms (future)

### 5. UI System
- Chat bubbles above avatars
- Mini-map (optional)
- User list overlay
- Status indicators

### 6. Network System (Phase 2)
- WebSocket connection for real-time sync
- Player position broadcasting
- Chat message relay
- Presence management

## 📁 Folder Structure

```
app/
├── hangout/
│   ├── page.tsx                 # Main page wrapper
│   ├── HangoutContent.tsx       # Existing content (keep for fallback)
│   └── lobby/
│       ├── StarLobby.tsx        # Main PixiJS lobby component
│       ├── hooks/
│       │   ├── usePixiApp.ts    # PixiJS application hook
│       │   ├── usePathfinding.ts # A* pathfinding
│       │   ├── useAvatars.ts    # Avatar management
│       │   └── useLobbySync.ts  # Network sync (Phase 2)
│       ├── systems/
│       │   ├── RenderSystem.ts  # PixiJS rendering
│       │   ├── InputSystem.ts   # Click/touch handling
│       │   ├── MovementSystem.ts # Pathfinding & movement
│       │   └── ChatSystem.ts    # Bubble management
│       ├── components/
│       │   ├── Avatar.ts        # Player avatar sprite
│       │   ├── Tilemap.ts       # Isometric tilemap
│       │   ├── ChatBubble.ts    # Speech bubbles
│       │   └── Furniture.ts     # Decorations
│       ├── assets/
│       │   ├── tiles/           # Tilemap sprites
│       │   ├── avatars/         # Character sprites
│       │   └── furniture/       # Decoration sprites
│       └── types.ts             # TypeScript interfaces
│
styles/
├── globals.css                  # Existing global styles
└── pixel-lobby.css              # Pixel-specific styles
```

## 📋 Staged Roadmap

### Stage 1: MVP (Week 1-2)
- [ ] Basic PixiJS setup with React integration
- [ ] Isometric tilemap rendering (single room)
- [ ] Single player avatar with click-to-move
- [ ] Basic pathfinding (A* or direct)
- [ ] Collision detection with walls
- [ ] Depth sorting for proper layering
- [ ] Chat input integrated with existing system
- [ ] Chat bubbles above avatars

### Stage 2: Multi-Room (Week 3)
- [ ] Room data format specification
- [ ] Room loading/switching
- [ ] Door/portal system
- [ ] Room-specific collision maps
- [ ] Furniture placement system

### Stage 3: Multiplayer (Week 4-5)
- [ ] WebSocket integration
- [ ] Real-time position sync
- [ ] Player join/leave events
- [ ] Movement interpolation for smooth remote players
- [ ] Chat broadcast to room

### Stage 4: Polish (Week 6)
- [ ] Avatar customization (variants)
- [ ] Emote animations
- [ ] Sound effects
- [ ] Mobile optimization
- [ ] Performance tuning

## 💻 MVP Implementation

### Core Component: `StarLobby.tsx`

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';

// ============================================
// Types
// ============================================

interface Position {
  x: number;
  y: number;
}

interface TilePosition {
  col: number;
  row: number;
}

interface Avatar {
  id: string;
  address: string;
  displayName: string;
  position: Position;
  targetPosition: Position | null;
  path: TilePosition[];
  sprite: PIXI.Container | null;
  chatBubble: PIXI.Container | null;
  chatTimeout: NodeJS.Timeout | null;
}

// ============================================
// Constants
// ============================================

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_COLS = 12;
const MAP_ROWS = 12;

// 0 = floor, 1 = wall/obstacle
const COLLISION_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

// ============================================
// Coordinate Conversion
// ============================================

function isoToScreen(col: number, row: number): Position {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

function screenToIso(x: number, y: number): TilePosition {
  const col = Math.floor((x / (TILE_WIDTH / 2) + y / (TILE_HEIGHT / 2)) / 2);
  const row = Math.floor((y / (TILE_HEIGHT / 2) - x / (TILE_WIDTH / 2)) / 2);
  return { col, row };
}

// ============================================
// Pathfinding (Simple A*)
// ============================================

function findPath(start: TilePosition, end: TilePosition): TilePosition[] {
  // Check bounds and walkability
  if (!isWalkable(end.col, end.row)) return [];
  if (!isWalkable(start.col, start.row)) return [];
  
  const openSet: TilePosition[] = [start];
  const cameFrom = new Map<string, TilePosition>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  
  const key = (p: TilePosition) => `${p.col},${p.row}`;
  const heuristic = (a: TilePosition, b: TilePosition) => 
    Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  
  gScore.set(key(start), 0);
  fScore.set(key(start), heuristic(start, end));
  
  while (openSet.length > 0) {
    // Get node with lowest fScore
    openSet.sort((a, b) => (fScore.get(key(a)) || Infinity) - (fScore.get(key(b)) || Infinity));
    const current = openSet.shift()!;
    
    if (current.col === end.col && current.row === end.row) {
      // Reconstruct path
      const path: TilePosition[] = [];
      let node: TilePosition | undefined = current;
      while (node) {
        path.unshift(node);
        node = cameFrom.get(key(node));
      }
      return path;
    }
    
    // Check neighbors (4-directional)
    const neighbors = [
      { col: current.col + 1, row: current.row },
      { col: current.col - 1, row: current.row },
      { col: current.col, row: current.row + 1 },
      { col: current.col, row: current.row - 1 },
    ];
    
    for (const neighbor of neighbors) {
      if (!isWalkable(neighbor.col, neighbor.row)) continue;
      
      const tentativeG = (gScore.get(key(current)) || 0) + 1;
      const neighborKey = key(neighbor);
      
      if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, end));
        
        if (!openSet.some(p => p.col === neighbor.col && p.row === neighbor.row)) {
          openSet.push(neighbor);
        }
      }
    }
  }
  
  return []; // No path found
}

function isWalkable(col: number, row: number): boolean {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return false;
  return COLLISION_MAP[row][col] === 0;
}

// ============================================
// Main Component
// ============================================

interface StarLobbyProps {
  address?: string;
  displayName?: string;
  onChatMessage?: (message: string) => void;
  chatMessages?: Array<{ sender: string; message: string; timestamp: number }>;
}

export default function StarLobby({ 
  address, 
  displayName,
  onChatMessage,
  chatMessages = [],
}: StarLobbyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const avatarRef = useRef<Avatar | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;
    
    const app = new PIXI.Application();
    
    const init = async () => {
      await app.init({
        background: '#0a0a15',
        resizeTo: containerRef.current!,
        antialias: false,
        roundPixels: true,
        resolution: window.devicePixelRatio || 1,
      });
      
      // Enable pixel-perfect rendering
      PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
      
      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;
      
      // Create world container
      const world = new PIXI.Container();
      world.x = app.screen.width / 2;
      world.y = 100;
      app.stage.addChild(world);
      worldRef.current = world;
      
      // Draw tilemap
      drawTilemap(world);
      
      // Create player avatar
      if (address) {
        const startPos = isoToScreen(5, 5);
        const avatar = createAvatar(address, displayName || 'Player', startPos);
        avatarRef.current = avatar;
        if (avatar.sprite) {
          world.addChild(avatar.sprite);
        }
      }
      
      // Start game loop
      app.ticker.add(gameLoop);
      
      setIsLoaded(true);
    };
    
    init();
    
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [address, displayName]);
  
  // Handle click-to-move
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!worldRef.current || !avatarRef.current) return;
    
    const world = worldRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Convert click to world coordinates
    const clickX = e.clientX - rect.left - world.x;
    const clickY = e.clientY - rect.top - world.y;
    
    // Convert to tile position
    const tile = screenToIso(clickX, clickY);
    
    if (isWalkable(tile.col, tile.row)) {
      const currentTile = screenToIso(
        avatarRef.current.position.x,
        avatarRef.current.position.y
      );
      
      const path = findPath(currentTile, tile);
      if (path.length > 1) {
        avatarRef.current.path = path.slice(1); // Remove start position
      }
    }
  }, []);
  
  // Game loop
  const gameLoop = useCallback((ticker: PIXI.Ticker) => {
    const avatar = avatarRef.current;
    if (!avatar || !avatar.sprite) return;
    
    // Process movement along path
    if (avatar.path.length > 0) {
      const nextTile = avatar.path[0];
      const targetPos = isoToScreen(nextTile.col, nextTile.row);
      
      const dx = targetPos.x - avatar.position.x;
      const dy = targetPos.y - avatar.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const speed = 3 * ticker.deltaTime;
      
      if (dist < speed) {
        avatar.position.x = targetPos.x;
        avatar.position.y = targetPos.y;
        avatar.path.shift();
      } else {
        avatar.position.x += (dx / dist) * speed;
        avatar.position.y += (dy / dist) * speed;
      }
      
      avatar.sprite.x = avatar.position.x;
      avatar.sprite.y = avatar.position.y;
    }
    
    // Sort children by Y for depth
    worldRef.current?.children.sort((a, b) => a.y - b.y);
  }, []);
  
  // Show chat bubble
  const showChatBubble = useCallback((message: string) => {
    const avatar = avatarRef.current;
    if (!avatar || !avatar.sprite || !worldRef.current) return;
    
    // Remove existing bubble
    if (avatar.chatBubble) {
      avatar.chatBubble.destroy();
      avatar.chatBubble = null;
    }
    if (avatar.chatTimeout) {
      clearTimeout(avatar.chatTimeout);
    }
    
    // Create new bubble
    const bubble = createChatBubble(message);
    bubble.y = -60;
    avatar.sprite.addChild(bubble);
    avatar.chatBubble = bubble;
    
    // Remove after delay
    avatar.chatTimeout = setTimeout(() => {
      if (avatar.chatBubble) {
        avatar.chatBubble.destroy();
        avatar.chatBubble = null;
      }
    }, 8000);
  }, []);
  
  // Handle incoming chat messages
  useEffect(() => {
    if (chatMessages.length > 0 && address) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.sender === address) {
        showChatBubble(lastMsg.message);
      }
    }
  }, [chatMessages, address, showChatBubble]);
  
  return (
    <div className="relative w-full h-[500px] rounded-lg overflow-hidden border-2 border-[#2a2a4e]">
      <div 
        ref={containerRef} 
        className="w-full h-full cursor-pointer"
        onClick={handleClick}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a15]">
          <div className="text-[#ffd700] animate-pixel-pulse">Loading lobby...</div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function drawTilemap(world: PIXI.Container): void {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const pos = isoToScreen(col, row);
      const isWall = COLLISION_MAP[row][col] === 1;
      
      const tile = new PIXI.Graphics();
      
      // Draw isometric diamond
      tile.moveTo(0, -TILE_HEIGHT / 2);
      tile.lineTo(TILE_WIDTH / 2, 0);
      tile.lineTo(0, TILE_HEIGHT / 2);
      tile.lineTo(-TILE_WIDTH / 2, 0);
      tile.closePath();
      
      tile.fill(isWall ? 0x1a1a2e : 0x2a2a4e);
      tile.stroke({ color: isWall ? 0x3a3a5e : 0x4a4a6e, width: 1 });
      
      tile.x = pos.x;
      tile.y = pos.y;
      world.addChild(tile);
    }
  }
}

function createAvatar(id: string, name: string, position: Position): Avatar {
  const container = new PIXI.Container();
  
  // Avatar body (placeholder - replace with sprite)
  const body = new PIXI.Graphics();
  body.circle(0, -12, 12);
  body.fill(0x44ff88);
  body.stroke({ color: 0xffd700, width: 2 });
  container.addChild(body);
  
  // Frog emoji placeholder
  const emoji = new PIXI.Text({
    text: '🐸',
    style: { fontSize: 20 },
  });
  emoji.anchor.set(0.5);
  emoji.y = -12;
  container.addChild(emoji);
  
  // Name label
  const label = new PIXI.Text({
    text: name.slice(0, 10),
    style: {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: '"Press Start 2P", monospace',
    },
  });
  label.anchor.set(0.5);
  label.y = 10;
  container.addChild(label);
  
  container.x = position.x;
  container.y = position.y;
  
  return {
    id,
    address: id,
    displayName: name,
    position: { ...position },
    targetPosition: null,
    path: [],
    sprite: container,
    chatBubble: null,
    chatTimeout: null,
  };
}

function createChatBubble(message: string): PIXI.Container {
  const container = new PIXI.Container();
  
  const text = new PIXI.Text({
    text: message.slice(0, 50),
    style: {
      fontSize: 8,
      fill: 0xffffff,
      fontFamily: '"Press Start 2P", monospace',
      wordWrap: true,
      wordWrapWidth: 100,
      align: 'center',
    },
  });
  text.anchor.set(0.5);
  
  const padding = 8;
  const bg = new PIXI.Graphics();
  bg.roundRect(
    -text.width / 2 - padding,
    -text.height / 2 - padding,
    text.width + padding * 2,
    text.height + padding * 2,
    4
  );
  bg.fill(0x1a1a3a);
  bg.stroke({ color: 0xffd700, width: 2 });
  
  // Bubble tail
  bg.moveTo(-4, text.height / 2 + padding);
  bg.lineTo(0, text.height / 2 + padding + 6);
  bg.lineTo(4, text.height / 2 + padding);
  bg.fill(0x1a1a3a);
  bg.stroke({ color: 0xffd700, width: 2 });
  
  container.addChild(bg);
  container.addChild(text);
  
  return container;
}
```

### CSS: `pixel-lobby.css`

```css
/* Pixel Lobby Specific Styles */

.star-lobby-container {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* Ensure canvas stays crisp */
.star-lobby-container canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .star-lobby-container {
    height: 400px !important;
  }
}

@media (max-width: 480px) {
  .star-lobby-container {
    height: 300px !important;
  }
}
```

## 🔌 Integration Instructions

### 1. Install Dependencies

```bash
npm install pixi.js@^8.0.0
```

### 2. Mount/Unmount

The `StarLobby` component is self-contained and handles its own lifecycle:

```tsx
// In HangoutContent.tsx or new lobby page
import StarLobby from './lobby/StarLobby';

function HangoutPage() {
  const { address } = useAccount();
  
  return (
    <StarLobby 
      address={address}
      displayName={userProfile?.name}
      onChatMessage={handleSendMessage}
      chatMessages={messages}
    />
  );
}
```

### 3. Isolation

- Component creates/destroys its own PixiJS Application
- No global state pollution
- Uses React refs for internal state
- Cleans up on unmount

### 4. Responsive Setup

- Container uses `resizeTo` for automatic canvas sizing
- CSS handles mobile breakpoints
- Device pixel ratio respected for Retina displays

## 🎨 Asset Requirements

### Tile Sprites (64x32px isometric)
- `floor_default.png` - Standard floor tile
- `floor_carpet.png` - Carpet variant
- `wall_basic.png` - Wall/obstacle tile

### Avatar Sprites (32x48px)
- `avatar_idle.png` - Idle state (4 directions)
- `avatar_walk.png` - Walk cycle (4 directions, 4 frames each)

### Furniture (various sizes)
- `couch.png`, `table.png`, `plant.png`, etc.

## 📝 Notes & Alternatives

### If PixiJS Proves Too Heavy

Consider a lightweight Canvas2D implementation:
1. Create `CanvasLobby.tsx` with native Canvas API
2. Manual sprite blitting instead of Container/Sprite objects
3. RequestAnimationFrame for game loop
4. Same coordinate/pathfinding logic applies

### WebSocket Considerations

For Phase 3 multiplayer:
- Consider Socket.io or native WebSocket
- Use existing Next.js API routes for signaling
- May need dedicated WebSocket server for production

## 🏷️ Labels

- `feature`
- `hangout`
- `pixel-art`
- `pixi.js`
- `social`
- `phase-1`

## 📅 Estimated Effort

- **MVP**: 2-3 weeks (1 developer)
- **Multi-room**: 1 week
- **Multiplayer**: 2 weeks
- **Polish**: 1 week

**Total**: 6-7 weeks for full implementation

---

*The stars await in the lobby... ⭐*
