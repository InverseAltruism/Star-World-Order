# Star World Order - Planned Features

This directory contains detailed specifications for upcoming features in the Star World Order project.

## 📋 Issue Documents

| Issue | Title | Status | Priority |
|-------|-------|--------|----------|
| [#1](./001-habbo-style-pixel-art-lobby.md) | Habbo Hotel-Style Pixel Art Lobby | 📝 Planned | High |
| [#2](./002-star-points-store.md) | STAR Points Store/Shop | 📝 Planned | High |
| [#3](./003-improved-starting-screen-visuals.md) | Improved Starting Screen Visuals | 📝 Planned | Medium |

## 🎯 Overview

### Issue #1: Habbo Hotel-Style Pixel Art Lobby
Create an immersive 2D isometric social space using PixiJS where Star Skrumpey holders can:
- Navigate a pixel art lobby via click-to-move
- See other users' avatars in real-time
- Chat with speech bubbles above avatars
- Experience a nostalgic Habbo Hotel-inspired environment

**Key Technologies**: PixiJS, A* Pathfinding, WebSocket (Phase 2)

### Issue #2: STAR Points Store/Shop
Build a reward exchange system where holders can spend their accumulated STAR points on:
- Whitelist spots for upcoming mints
- NFTs and digital collectibles
- Physical merchandise
- Special access passes

**Distribution Methods**:
- **FCFS** (First Come First Served) - Instant purchase
- **Lottery** - Random selection from entrants

Includes admin dashboard for item management.

### Issue #3: Improved Starting Screen Visuals
Enhance the current loading screen with:
- Richer room environment (moonlight, decorations, ambient effects)
- More authentic console boot sequence
- Polished animations throughout
- Cohesive retro pixel art aesthetic
- Optional sound effects

## 🗓️ Estimated Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPMENT TIMELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WEEK 1-2   ║████████████████║  Issue #1 MVP (Lobby)           │
│  WEEK 3     ║████████║         Issue #1 Multi-room             │
│  WEEK 4-5   ║████████████████║  Issue #1 Multiplayer           │
│  WEEK 6     ║████████║         Issue #1 Polish                 │
│                                                                 │
│  WEEK 1-2   ║████████████████║  Issue #2 MVP (Store)           │
│  WEEK 3     ║████████║         Issue #2 Lottery System         │
│  WEEK 4     ║████████║         Issue #2 Admin Interface        │
│  WEEK 5     ║████████║         Issue #2 Polish                 │
│                                                                 │
│  WEEK 1     ║████████║         Issue #3 Environment            │
│  WEEK 2     ║████████║         Issue #3 Animations             │
│  WEEK 3     ║████████║         Issue #3 Console Details        │
│  WEEK 4     ║████████║         Issue #3 Transitions            │
│  WEEK 5     ║████████║         Issue #3 Polish                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

NOTE: Issues can be worked on in parallel with multiple developers.
```

## 🏷️ Labels Reference

| Label | Description |
|-------|-------------|
| `feature` | New feature implementation |
| `enhancement` | Improvement to existing feature |
| `hangout` | Related to Hangout Hub |
| `store` | Related to STAR Store |
| `ui` | User interface changes |
| `animation` | Animation work |
| `pixel-art` | Pixel art assets/styling |
| `pixi.js` | PixiJS related |
| `lottery` | Lottery system |
| `fcfs` | First Come First Served system |
| `admin` | Admin functionality |

## 📂 How to Use These Documents

1. **For Developers**: Each document contains:
   - Technical architecture
   - Code examples
   - Database schemas
   - Implementation checklists

2. **For Project Managers**: Each document includes:
   - Staged roadmaps
   - Estimated effort
   - Dependencies

3. **For Designers**: Each document specifies:
   - Asset requirements
   - UI/UX considerations
   - Animation details

## 🤝 Contributing

When implementing these features:
1. Create a feature branch: `feature/issue-1-lobby`
2. Follow the implementation checklist
3. Test thoroughly on mobile and desktop
4. Submit PR referencing the issue number

---

*The stars are aligning... ⭐*
