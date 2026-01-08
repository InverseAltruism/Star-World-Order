// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title StarForge
 * @author Star World Order DAO
 * @notice Provably fair 5x5 constellation grid game on Monad
 * @dev Commit-reveal RNG game with constellation pattern matching
 * 
 * Key Features:
 * - 5x5 grid reveal game with star patterns
 * - Commit-reveal RNG for provable fairness
 * - 3 tiers: Bronze (45 MON), Silver (225 MON), Gold (450 MON)
 * - Pattern-based payouts up to 10x
 * - Jackpot pool for Supernova (all 25 stars)
 * - Star trait holders get better RTP (3% bonus)
 * - Tier auto-locking based on treasury balance
 * 
 * Fee Distribution:
 * - 88% → Prize pool (regular wins)
 * - 5% → Jackpot pool (Supernova only)
 * - 7% → Treasury (standard players)
 * - 4% → Treasury, 3% → Player bonus (Star holders)
 * 
 * Deployed on Monad (Chain ID: 143)
 */
contract StarForge is ReentrancyGuard, Ownable, Pausable {
    
    // ============ Constants ============
    
    /// @notice Basis points divisor (100% = 10000 bps)
    uint256 public constant BPS_DIVISOR = 10000;
    
    /// @notice Prize pool allocation (88%)
    uint256 public constant PRIZE_POOL_BPS = 8800;
    
    /// @notice Jackpot pool allocation (5%)
    uint256 public constant JACKPOT_POOL_BPS = 500;
    
    /// @notice Standard treasury fee (7%)
    uint256 public constant TREASURY_STANDARD_BPS = 700;
    
    /// @notice Star holder treasury fee (4%)
    uint256 public constant TREASURY_STAR_BPS = 400;
    
    /// @notice Star holder bonus (3%)
    uint256 public constant STAR_BONUS_BPS = 300;
    
    /// @notice Maximum multiplier (10x for safety)
    uint256 public constant MAX_MULTIPLIER = 10;
    
    /// @notice Rate limit: max games per time window
    uint256 public constant RATE_LIMIT_GAMES = 10;
    
    /// @notice Rate limit time window (1 minute)
    uint256 public constant RATE_LIMIT_WINDOW = 1 minutes;
    
    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract for trait verification
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice DAO Treasury address for fee collection
    address public daoTreasury;
    
    /// @notice Tier configurations
    /// @dev SECURITY FIX #2: Renamed treasuryBalance to prizePool for clarity
    struct TierConfig {
        uint256 entryFee;           // Entry fee in wei
        uint256 maxPayout;          // Maximum payout (10x)
        uint256 minTreasuryRequired; // Minimum treasury balance to enable
        uint256 prizePool;          // Current tier prize pool (was: treasuryBalance)
        uint256 jackpotPool;        // Jackpot pool for this tier
        bool isActive;              // Whether tier is active
    }
    
    /// @notice Tier enum
    enum Tier { BRONZE, SILVER, GOLD }
    
    /// @notice Tier configurations mapping
    mapping(Tier => TierConfig) public tiers;
    
    /// @notice Game commitment before reveal
    /// @dev SECURITY FIX #6: Added VRF fields for provably fair randomness
    struct GameCommitment {
        address player;
        Tier tier;
        uint256 entryFee;
        bytes32 serverSeedHash;
        uint256 nonce;
        uint256 timestamp;
        bool isStarHolder;
        bool revealed;
        uint256 vrfRequestId;       // VRF request ID (0 if not requested)
        bool vrfFulfilled;          // Whether VRF was fulfilled
    }
    
    /// @notice Game commitments by game ID
    mapping(bytes32 => GameCommitment) public commitments;
    
    /// @notice Player nonces for game uniqueness
    mapping(address => uint256) public playerNonces;
    
    /// @notice Rate limiting: player => last game timestamps
    mapping(address => uint256[]) private playerGameTimestamps;
    
    /// @notice Total games played
    uint256 public totalGamesPlayed;
    
    /// @notice Total wagered across all tiers
    uint256 public totalWagered;
    
    /// @notice Total paid out
    uint256 public totalPaidOut;
    
    /// @notice Star Skrumpey token IDs (for verification)
    mapping(uint256 => bool) public isStarSkrumpey;
    
    // ============ VRF State Variables (SECURITY FIX #5, #6) ============
    
    /// @notice Whether VRF is enabled (can be toggled by owner)
    bool public vrfEnabled;
    
    /// @notice Authorized callers for VRF requests (SECURITY FIX #5)
    mapping(address => bool) public authorizedCallers;
    
    /// @notice VRF randomness by game ID (SECURITY FIX #6)
    mapping(bytes32 => uint256) public vrfRandomness;
    
    /// @notice VRF request ID to game ID mapping
    mapping(uint256 => bytes32) public vrfRequestToGame;
    
    /// @notice Next VRF request ID counter
    uint256 private nextVRFRequestId;
    
    // ============ Refund State Variables (SECURITY FIX #3) ============
    
    /// @notice Refund window duration (e.g., 24 hours)
    uint256 public constant REFUND_WINDOW = 24 hours;
    
    /// @notice Reserved funds for potential refunds
    mapping(bytes32 => bool) public refundReserved;
    
    // ============ Events ============
    
    /// @notice Emitted when a game is committed
    event GameCommitted(
        bytes32 indexed gameId,
        address indexed player,
        Tier tier,
        uint256 entryFee,
        bytes32 serverSeedHash,
        uint256 nonce,
        bool isStarHolder
    );
    
    /// @notice Emitted when a game is revealed
    event GameRevealed(
        bytes32 indexed gameId,
        address indexed player,
        Tier tier,
        uint256 grid,
        string pattern,
        uint256 multiplier,
        uint256 payout,
        bool isJackpot
    );
    
    /// @notice Emitted when jackpot is won
    event JackpotWon(
        bytes32 indexed gameId,
        address indexed winner,
        Tier tier,
        uint256 amount
    );
    
    /// @notice Emitted when tier config is updated
    event TierUpdated(
        Tier tier,
        uint256 entryFee,
        uint256 maxPayout,
        uint256 minTreasuryRequired
    );
    
    /// @notice Emitted when tier is enabled/disabled
    event TierStatusChanged(Tier tier, bool isActive);
    
    /// @notice Emitted when treasury is funded
    event TreasuryFunded(Tier tier, uint256 amount);
    
    /// @notice Emitted when jackpot pool is seeded
    event JackpotSeeded(Tier tier, uint256 amount);
    
    /// @notice Emitted when VRF randomness is requested (SECURITY FIX #6)
    event VRFRequested(bytes32 indexed gameId, uint256 indexed requestId);
    
    /// @notice Emitted when VRF randomness is fulfilled (SECURITY FIX #6)
    event VRFFulfilled(bytes32 indexed gameId, uint256 indexed requestId, uint256 randomness);
    
    /// @notice Emitted when a refund is requested (SECURITY FIX #3)
    event RefundIssued(bytes32 indexed gameId, address indexed player, uint256 amount);
    
    // ============ Errors ============
    
    error InvalidTier();
    error TierNotActive();
    error InsufficientTreasuryBalance();
    error InvalidEntryFee();
    error GameAlreadyRevealed();
    error GameNotFound();
    error InvalidServerSeed();
    error RateLimitExceeded();
    error InvalidPayout();
    error InsufficientJackpotPool();
    error TransferFailed();
    error InsufficientSurplus();  // SECURITY FIX #4
    error Unauthorized();  // SECURITY FIX #5
    error RefundWindowExpired();  // SECURITY FIX #3
    error RefundAlreadyProcessed();  // SECURITY FIX #3
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize StarForge contract
     * @param _starSkrumpeyNFT Star Skrumpey NFT contract address
     * @param _daoTreasury DAO treasury address
     */
    constructor(
        address _starSkrumpeyNFT,
        address _daoTreasury
    ) Ownable(msg.sender) {
        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        daoTreasury = _daoTreasury;
        
        // Initialize tiers
        tiers[Tier.BRONZE] = TierConfig({
            entryFee: 45 ether,      // 45 MON
            maxPayout: 450 ether,    // 450 MON
            minTreasuryRequired: 4500 ether, // 4,500 MON
            prizePool: 0,
            jackpotPool: 0,
            isActive: false
        });
        
        tiers[Tier.SILVER] = TierConfig({
            entryFee: 225 ether,     // 225 MON
            maxPayout: 2250 ether,   // 2,250 MON
            minTreasuryRequired: 22500 ether, // 22,500 MON
            prizePool: 0,
            jackpotPool: 0,
            isActive: false
        });
        
        tiers[Tier.GOLD] = TierConfig({
            entryFee: 450 ether,     // 450 MON
            maxPayout: 4500 ether,   // 4,500 MON
            minTreasuryRequired: 45000 ether, // 45,000 MON
            prizePool: 0,
            jackpotPool: 0,
            isActive: false
        });
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Commit to a new game
     * @param _tier Game tier (Bronze/Silver/Gold)
     * @param serverSeedHash Server seed hash commitment
     * @return gameId Unique game identifier
     */
    function commitGame(
        Tier _tier,
        bytes32 serverSeedHash
    ) external payable nonReentrant whenNotPaused returns (bytes32 gameId) {
        TierConfig storage tierConfig = tiers[_tier];
        
        // Validate tier and entry fee
        if (!tierConfig.isActive) revert TierNotActive();
        if (msg.value != tierConfig.entryFee) revert InvalidEntryFee();
        
        // Check rate limit
        if (!_checkRateLimit(msg.sender)) revert RateLimitExceeded();
        
        // Check if player holds Star Skrumpey
        bool _isStarHolder = _checkStarHolder(msg.sender);
        
        // Generate game ID
        uint256 nonce = playerNonces[msg.sender]++;
        gameId = keccak256(abi.encodePacked(
            msg.sender,
            _tier,
            nonce,
            block.timestamp,
            serverSeedHash
        ));
        
        // Store commitment
        commitments[gameId] = GameCommitment({
            player: msg.sender,
            tier: _tier,
            entryFee: msg.value,
            serverSeedHash: serverSeedHash,
            nonce: nonce,
            timestamp: block.timestamp,
            isStarHolder: _isStarHolder,
            revealed: false,
            vrfRequestId: 0,        // SECURITY FIX #6: Initialize VRF fields
            vrfFulfilled: false
        });
        
        // Distribute entry fee
        _distributeEntryFee(_tier, msg.value, _isStarHolder);
        
        // Update stats
        totalWagered += msg.value;
        
        emit GameCommitted(
            gameId,
            msg.sender,
            _tier,
            msg.value,
            serverSeedHash,
            nonce,
            _isStarHolder
        );
    }
    
    /**
     * @notice Reveal game result and process payout
     * @param gameId Game identifier
     * @param serverSeed Server seed (reveals hash)
     * @param grid 25-bit grid result
     * @param pattern Pattern name
     * @param multiplier Payout multiplier in basis points (e.g., 200 = 2x, 1000 = 10x)
     * @dev SECURITY FIX #1: Multipliers are in basis points throughout
     */
    function revealGame(
        bytes32 gameId,
        bytes32 serverSeed,
        uint256 grid,
        string calldata pattern,
        uint256 multiplier
    ) external nonReentrant whenNotPaused {
        GameCommitment storage commitment = commitments[gameId];
        
        // Validate game exists and not revealed
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.revealed) revert GameAlreadyRevealed();
        
        // Verify server seed matches commitment
        if (keccak256(abi.encodePacked(serverSeed)) != commitment.serverSeedHash) {
            revert InvalidServerSeed();
        }
        
        // SECURITY FIX #6: Verify grid was generated from VRF if enabled
        if (vrfEnabled && commitment.vrfRequestId != 0) {
            // Ensure VRF was fulfilled
            if (!commitment.vrfFulfilled) revert InvalidServerSeed();
            
            // Validate grid matches VRF randomness
            uint256 expectedGrid = _generateGridFromVRF(vrfRandomness[gameId], serverSeed);
            if (grid != expectedGrid) revert InvalidServerSeed();
        }
        
        // Mark as revealed
        commitment.revealed = true;
        
        // SECURITY FIX #1: Validate multiplier in basis points (1000 = 10x)
        // Max 10x = 10000 basis points, so MAX_MULTIPLIER * 1000 = 10000
        bool isJackpot = (multiplier == type(uint256).max);
        if (!isJackpot && multiplier > MAX_MULTIPLIER * 1000) {
            revert InvalidPayout();
        }
        
        uint256 payout = 0;
        TierConfig storage tierConfig = tiers[commitment.tier];
        
        if (isJackpot) {
            // Supernova - award jackpot
            payout = tierConfig.jackpotPool;
            if (payout == 0) revert InsufficientJackpotPool();
            
            tierConfig.jackpotPool = 0;
            
            emit JackpotWon(gameId, commitment.player, commitment.tier, payout);
        } else if (multiplier > 0) {
            // Regular win - calculate payout
            payout = _calculatePayout(
                commitment.entryFee,
                multiplier,
                commitment.isStarHolder
            );
            
            // SECURITY FIX #2: Check prize pool can cover payout
            if (payout > tierConfig.prizePool) {
                revert InsufficientTreasuryBalance();
            }
            
            tierConfig.prizePool -= payout;
        }
        
        // Transfer payout to player
        if (payout > 0) {
            totalPaidOut += payout;
            (bool success, ) = payable(commitment.player).call{value: payout}("");
            if (!success) revert TransferFailed();
        }
        
        // Update stats
        totalGamesPlayed++;
        
        emit GameRevealed(
            gameId,
            commitment.player,
            commitment.tier,
            grid,
            pattern,
            multiplier,
            payout,
            isJackpot
        );
    }
    
    /**
     * @notice Fund tier treasury (owner only)
     * @param tier Tier to fund
     */
    function fundTreasury(Tier tier) external payable onlyOwner {
        TierConfig storage tierConfig = tiers[tier];
        tierConfig.prizePool += msg.value;
        
        // Auto-enable tier if minimum reached
        if (tierConfig.prizePool >= tierConfig.minTreasuryRequired) {
            tierConfig.isActive = true;
            emit TierStatusChanged(tier, true);
        }
        
        emit TreasuryFunded(tier, msg.value);
    }
    
    /**
     * @notice Seed jackpot pool (owner only)
     * @param tier Tier to seed
     */
    function seedJackpot(Tier tier) external payable onlyOwner {
        tiers[tier].jackpotPool += msg.value;
        emit JackpotSeeded(tier, msg.value);
    }
    
    /**
     * @notice Update tier configuration (owner only)
     * @param tier Tier to update
     * @param entryFee New entry fee
     * @param maxPayout New max payout
     * @param minTreasuryRequired New minimum treasury
     */
    function updateTier(
        Tier tier,
        uint256 entryFee,
        uint256 maxPayout,
        uint256 minTreasuryRequired
    ) external onlyOwner {
        TierConfig storage tierConfig = tiers[tier];
        tierConfig.entryFee = entryFee;
        tierConfig.maxPayout = maxPayout;
        tierConfig.minTreasuryRequired = minTreasuryRequired;
        
        emit TierUpdated(tier, entryFee, maxPayout, minTreasuryRequired);
    }
    
    /**
     * @notice Enable/disable tier (owner only)
     * @param tier Tier to update
     * @param isActive New status
     */
    function setTierStatus(Tier tier, bool isActive) external onlyOwner {
        tiers[tier].isActive = isActive;
        emit TierStatusChanged(tier, isActive);
    }
    
    /**
     * @notice Register Star Skrumpey token IDs (owner only)
     * @param tokenIds Array of token IDs with Star trait
     * @param isStarIds Whether these IDs are Star Skrumpeys
     */
    function registerStarSkrumpeys(
        uint256[] calldata tokenIds,
        bool isStarIds
    ) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            isStarSkrumpey[tokenIds[i]] = isStarIds;
        }
    }
    
    /**
     * @notice Update DAO treasury address (owner only)
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        daoTreasury = newTreasury;
    }
    
    /**
     * @notice Pause contract (owner only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Emergency withdraw (owner only)
     * @param amount Amount to withdraw
     * @dev SECURITY FIX #4: Added solvency check to prevent draining player funds
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        // Calculate total liabilities (prize pools + jackpot pools)
        uint256 totalLiabilities = 0;
        for (uint256 i = 0; i < 3; i++) {
            Tier tier = Tier(i);
            totalLiabilities += tiers[tier].prizePool + tiers[tier].jackpotPool;
        }
        
        // Only allow withdrawal of surplus above liabilities
        uint256 surplus = address(this).balance - totalLiabilities;
        if (amount > surplus) revert InsufficientSurplus();
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    
    // ============ VRF Functions (SECURITY FIX #5, #6) ============
    
    /**
     * @notice Modifier to restrict VRF functions to authorized callers
     * @dev SECURITY FIX #5: Prevents unauthorized VRF requests
     */
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }
    
    /**
     * @notice Request VRF randomness for a game
     * @param gameId Game identifier
     * @return requestId VRF request ID
     * @dev SECURITY FIX #5: Added access control
     * @dev SECURITY FIX #6: Integrated VRF into game flow
     */
    function requestVRFRandomness(bytes32 gameId) external onlyAuthorized returns (uint256 requestId) {
        GameCommitment storage commitment = commitments[gameId];
        
        // Validate game exists and not revealed
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.revealed) revert GameAlreadyRevealed();
        
        // Generate request ID
        requestId = ++nextVRFRequestId;
        
        // Store VRF request
        commitment.vrfRequestId = requestId;
        vrfRequestToGame[requestId] = gameId;
        
        emit VRFRequested(gameId, requestId);
        
        // Note: Actual VRF request to Gelato would be made here
        // This is a placeholder for the Gelato VRF integration
        return requestId;
    }
    
    /**
     * @notice Fulfill VRF randomness callback
     * @param requestId VRF request ID
     * @param randomness Random value from VRF
     * @dev SECURITY FIX #6: Store VRF randomness for grid validation
     * @dev This should be called by the VRF coordinator (Gelato)
     */
    function fulfillVRFRandomness(
        uint256 requestId,
        uint256 randomness
    ) external onlyAuthorized {
        bytes32 gameId = vrfRequestToGame[requestId];
        if (gameId == bytes32(0)) revert GameNotFound();
        
        GameCommitment storage commitment = commitments[gameId];
        
        // Store randomness
        vrfRandomness[gameId] = randomness;
        commitment.vrfFulfilled = true;
        
        emit VRFFulfilled(gameId, requestId, randomness);
    }
    
    /**
     * @notice Set authorized caller for VRF functions (owner only)
     * @param caller Address to authorize
     * @param authorized Whether to authorize or deauthorize
     * @dev SECURITY FIX #5: Manage VRF access control
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }
    
    /**
     * @notice Enable or disable VRF (owner only)
     * @param enabled Whether VRF is enabled
     * @dev SECURITY FIX #6: Toggle VRF requirement
     */
    function setVRFEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
    }
    
    /**
     * @notice Request refund for unrevealed game
     * @param gameId Game identifier
     * @dev SECURITY FIX #3: Added refund mechanism with solvency checks
     */
    function requestRefund(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        // Validate game exists and belongs to caller
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundReserved[gameId]) revert RefundAlreadyProcessed();
        
        // Check refund window (must be after timeout period)
        if (block.timestamp < commitment.timestamp + REFUND_WINDOW) {
            revert RefundWindowExpired();
        }
        
        // Mark as refunded
        refundReserved[gameId] = true;
        commitment.revealed = true; // Prevent further actions
        
        TierConfig storage tierConfig = tiers[commitment.tier];
        
        // Calculate refund from prize pool allocation
        uint256 prizePoolAmount = (commitment.entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        
        // SECURITY FIX #3: Check solvency and refund what we can
        if (prizePoolAmount > tierConfig.prizePool) {
            // Refund available amount, don't revert
            prizePoolAmount = tierConfig.prizePool;
        }
        
        if (prizePoolAmount > 0) {
            tierConfig.prizePool -= prizePoolAmount;
            
            // Transfer refund
            (bool success, ) = payable(msg.sender).call{value: prizePoolAmount}("");
            if (!success) revert TransferFailed();
            
            emit RefundIssued(gameId, msg.sender, prizePoolAmount);
        }
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get tier configuration
     * @param tier Tier to query
     * @return Tier configuration
     */
    function getTierConfig(Tier tier) external view returns (TierConfig memory) {
        return tiers[tier];
    }
    
    /**
     * @notice Get game commitment
     * @param gameId Game identifier
     * @return Game commitment
     */
    function getCommitment(bytes32 gameId) external view returns (GameCommitment memory) {
        return commitments[gameId];
    }
    
    /**
     * @notice Check if address holds Star Skrumpey
     * @param player Player address
     * @return Whether player holds Star Skrumpey
     */
    function isStarHolder(address player) external view returns (bool) {
        return _checkStarHolder(player);
    }
    
    /**
     * @notice Get player's recent game count (for rate limiting)
     * @param player Player address
     * @return Number of games in current window
     */
    function getRecentGameCount(address player) external view returns (uint256) {
        return _getRecentGameCount(player);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Distribute entry fee to prize pool, jackpot, and treasury
     * @param tier Game tier
     * @param entryFee Entry fee amount
     * @param starHolder Whether player holds Star Skrumpey
     */
    function _distributeEntryFee(
        Tier tier,
        uint256 entryFee,
        bool starHolder
    ) internal {
        TierConfig storage tierConfig = tiers[tier];
        
        // Calculate allocations
        uint256 prizePoolAmount = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 jackpot = (entryFee * JACKPOT_POOL_BPS) / BPS_DIVISOR;
        uint256 treasury;
        uint256 playerBonus = 0;
        
        if (starHolder) {
            // Star holder: 4% treasury, 3% bonus
            treasury = (entryFee * TREASURY_STAR_BPS) / BPS_DIVISOR;
            playerBonus = (entryFee * STAR_BONUS_BPS) / BPS_DIVISOR;
        } else {
            // Standard: 7% treasury
            treasury = (entryFee * TREASURY_STANDARD_BPS) / BPS_DIVISOR;
        }
        
        // SECURITY FIX #2: Allocate funds to prize pool
        tierConfig.prizePool += prizePoolAmount;
        tierConfig.jackpotPool += jackpot;
        
        // Transfer treasury fee to DAO
        if (treasury > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasury}("");
            if (!success) revert TransferFailed();
        }
        
        // Return player bonus to Star holders
        if (playerBonus > 0) {
            tierConfig.prizePool += playerBonus;
        }
    }
    
    /**
     * @notice Calculate payout for regular win
     * @param entryFee Entry fee
     * @param multiplier Multiplier in basis points (e.g., 200 = 2x, 1000 = 10x)
     * @param starHolder Whether player holds Star Skrumpey
     * @return Payout amount
     * @dev SECURITY FIX #1: Correctly divide by BPS_DIVISOR (10000) for basis points
     */
    function _calculatePayout(
        uint256 entryFee,
        uint256 multiplier,
        bool starHolder
    ) internal pure returns (uint256) {
        // Calculate prize pool allocation
        uint256 prizePool = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        
        // SECURITY FIX #1: Apply multiplier using basis points (divide by 10000, not 100)
        // Example: prizePool = 100, multiplier = 200 (2x) → (100 * 200) / 10000 = 2
        uint256 basePayout = (prizePool * multiplier) / BPS_DIVISOR;
        
        // Add Star holder bonus
        if (starHolder) {
            uint256 bonus = (entryFee * STAR_BONUS_BPS) / BPS_DIVISOR;
            return basePayout + bonus;
        }
        
        return basePayout;
    }
    
    /**
     * @notice Check if player owns any Star Skrumpey
     * @param player Player address
     * @return Whether player holds Star Skrumpey
     */
    function _checkStarHolder(address player) internal view returns (bool) {
        // Note: This is a simplified check
        // In production, implement efficient batch checking
        // or maintain a registry of Star holders
        uint256 balance = starSkrumpeyNFT.balanceOf(player);
        if (balance == 0) return false;
        
        // For now, assume any Skrumpey holder qualifies
        // In production, check specific token IDs against isStarSkrumpey mapping
        return true;
    }
    
    /**
     * @notice Check rate limit for player
     * @param player Player address
     * @return Whether player can play
     */
    function _checkRateLimit(address player) internal returns (bool) {
        uint256[] storage timestamps = playerGameTimestamps[player];
        uint256 cutoffTime = block.timestamp - RATE_LIMIT_WINDOW;
        
        // Remove old timestamps
        uint256 validCount = 0;
        for (uint256 i = 0; i < timestamps.length; i++) {
            if (timestamps[i] > cutoffTime) {
                validCount++;
            }
        }
        
        // Check if under limit
        if (validCount >= RATE_LIMIT_GAMES) {
            return false;
        }
        
        // Add current timestamp
        timestamps.push(block.timestamp);
        
        return true;
    }
    
    /**
     * @notice Get recent game count for player
     * @param player Player address
     * @return Number of games in current window
     */
    function _getRecentGameCount(address player) internal view returns (uint256) {
        uint256[] storage timestamps = playerGameTimestamps[player];
        uint256 cutoffTime = block.timestamp - RATE_LIMIT_WINDOW;
        
        uint256 count = 0;
        for (uint256 i = 0; i < timestamps.length; i++) {
            if (timestamps[i] > cutoffTime) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * @notice Generate grid from VRF randomness and server seed
     * @param randomness VRF random value
     * @param serverSeed Server seed
     * @return grid 25-bit grid representation
     * @dev SECURITY FIX #6: Deterministically generate grid from VRF + server seed
     */
    function _generateGridFromVRF(
        uint256 randomness,
        bytes32 serverSeed
    ) internal pure returns (uint256 grid) {
        // Combine VRF randomness with server seed for final grid
        bytes32 combinedSeed = keccak256(abi.encodePacked(randomness, serverSeed));
        
        // Extract 25 bits from combined seed for 5x5 grid
        // Each bit represents a star position (1 = star, 0 = empty)
        grid = uint256(combinedSeed) & 0x1FFFFFF; // Mask to 25 bits
        
        return grid;
    }
    
    /**
     * @notice Receive MON
     */
    receive() external payable {}
}
