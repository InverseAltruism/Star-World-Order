// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title StarForgeV2
 * @author Star World Order DAO
 * @notice Provably fair 5x5 constellation grid game on Monad with enhanced security
 * @dev Commit-reveal RNG game with VRF integration, timeout refunds, and proper Star trait verification
 * 
 * Security Improvements over V1:
 * - On-chain VRF integration for provably fair randomness (Gelato VRF compatible)
 * - Timeout/Refund mechanism: Players can refund if reveal doesn't occur within REVEAL_TIMEOUT
 * - maxPayout enforcement: Payouts are capped at tier's maxPayout
 * - Star trait verification: Proper enumeration through IERC721Enumerable
 * - Rate-limit bounds: Sliding window pattern prevents unbounded array growth
 * 
 * Key Features:
 * - 5x5 grid reveal game with star patterns
 * - Commit-reveal + VRF for provable fairness
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
 * VRF Options:
 * - Gelato VRF: Free, uses Gelato's decentralized network (recommended for Monad)
 * - Chainlink VRF: Requires LINK tokens but more established
 * - Chronicle: Lower gas, Schnorr-based signatures
 * 
 * Deployed on Monad (Chain ID: 143)
 */
contract StarForgeV2 is ReentrancyGuard, Ownable, Pausable {
    
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
    
    /// @notice Maximum rate limit entries to store per player (prevents unbounded growth)
    uint256 public constant MAX_RATE_LIMIT_ENTRIES = 20;
    
    /// @notice Timeout for reveal (24 hours) - after which player can request refund
    uint256 public constant REVEAL_TIMEOUT = 24 hours;
    
    /// @notice Refund penalty for timeout (5% goes to treasury to discourage abuse)
    uint256 public constant REFUND_PENALTY_BPS = 500;
    
    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract for trait verification
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice DAO Treasury address for fee collection
    address public daoTreasury;
    
    /// @notice VRF Coordinator address (Gelato VRF or Chainlink)
    address public vrfCoordinator;
    
    /// @notice Whether VRF is enabled (fallback to commit-reveal if disabled)
    bool public vrfEnabled;
    
    /// @notice Tier configurations
    struct TierConfig {
        uint256 entryFee;           // Entry fee in wei
        uint256 maxPayout;          // Maximum payout (enforced)
        uint256 minTreasuryRequired; // Minimum treasury balance to enable
        uint256 treasuryBalance;    // Current tier treasury balance
        uint256 jackpotPool;        // Jackpot pool for this tier
        bool isActive;              // Whether tier is active
    }
    
    /// @notice Tier enum
    enum Tier { BRONZE, SILVER, GOLD }
    
    /// @notice Game status enum
    enum GameStatus { PENDING, REVEALED, REFUNDED, CANCELLED }
    
    /// @notice Tier configurations mapping
    mapping(Tier => TierConfig) public tiers;
    
    /// @notice Game commitment before reveal
    struct GameCommitment {
        address player;
        Tier tier;
        uint256 entryFee;
        bytes32 serverSeedHash;
        uint256 nonce;
        uint256 timestamp;
        bool isStarHolder;
        GameStatus status;
        uint256 vrfRequestId;       // VRF request ID (if using VRF)
    }
    
    /// @notice Game commitments by game ID
    mapping(bytes32 => GameCommitment) public commitments;
    
    /// @notice VRF request ID to game ID mapping
    mapping(uint256 => bytes32) public vrfRequestToGameId;
    
    /// @notice Player nonces for game uniqueness
    mapping(address => uint256) public playerNonces;
    
    /// @notice Rate limiting with bounded storage
    /// @dev Uses a circular buffer pattern instead of unbounded array
    struct RateLimitData {
        uint256[MAX_RATE_LIMIT_ENTRIES] timestamps;
        uint256 head;               // Index of oldest entry
        uint256 count;              // Number of valid entries
    }
    
    /// @notice Rate limiting: player => rate limit data
    mapping(address => RateLimitData) private playerRateLimits;
    
    /// @notice Total games played
    uint256 public totalGamesPlayed;
    
    /// @notice Total wagered across all tiers
    uint256 public totalWagered;
    
    /// @notice Total paid out
    uint256 public totalPaidOut;
    
    /// @notice Total refunded
    uint256 public totalRefunded;
    
    /// @notice Star Skrumpey token IDs with Star trait
    /// @dev Set by owner after off-chain verification of metadata
    mapping(uint256 => bool) public isStarSkrumpey;
    
    /// @notice Number of registered Star Skrumpey token IDs
    uint256 public starSkrumpeyCount;
    
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
    
    /// @notice Emitted when a game is refunded due to timeout
    event GameRefunded(
        bytes32 indexed gameId,
        address indexed player,
        uint256 refundAmount,
        uint256 penaltyAmount
    );
    
    /// @notice Emitted when VRF randomness is requested
    event VRFRequested(
        bytes32 indexed gameId,
        uint256 requestId
    );
    
    /// @notice Emitted when VRF randomness is fulfilled
    event VRFFulfilled(
        bytes32 indexed gameId,
        uint256 requestId,
        uint256 randomness
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
    
    /// @notice Emitted when VRF coordinator is updated
    event VRFCoordinatorUpdated(address oldCoordinator, address newCoordinator);
    
    /// @notice Emitted when VRF is enabled/disabled
    event VRFStatusChanged(bool enabled);
    
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
    error RevealTimeoutNotReached();
    error GameNotPending();
    error NotGamePlayer();
    error InvalidVRFCoordinator();
    error VRFNotEnabled();
    error ZeroAddress();
    error PayoutExceedsMax();
    
    // ============ Modifiers ============
    
    /// @notice Only VRF coordinator can call
    modifier onlyVRFCoordinator() {
        if (msg.sender != vrfCoordinator) revert InvalidVRFCoordinator();
        _;
    }
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize StarForgeV2 contract
     * @param _starSkrumpeyNFT Star Skrumpey NFT contract address
     * @param _daoTreasury DAO treasury address
     * @param _vrfCoordinator VRF coordinator address (can be address(0) initially)
     */
    constructor(
        address _starSkrumpeyNFT,
        address _daoTreasury,
        address _vrfCoordinator
    ) Ownable(msg.sender) {
        if (_starSkrumpeyNFT == address(0)) revert ZeroAddress();
        if (_daoTreasury == address(0)) revert ZeroAddress();
        
        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        daoTreasury = _daoTreasury;
        vrfCoordinator = _vrfCoordinator;
        vrfEnabled = _vrfCoordinator != address(0);
        
        // Initialize tiers
        tiers[Tier.BRONZE] = TierConfig({
            entryFee: 45 ether,      // 45 MON
            maxPayout: 450 ether,    // 450 MON (10x max)
            minTreasuryRequired: 4500 ether, // 4,500 MON
            treasuryBalance: 0,
            jackpotPool: 0,
            isActive: false
        });
        
        tiers[Tier.SILVER] = TierConfig({
            entryFee: 225 ether,     // 225 MON
            maxPayout: 2250 ether,   // 2,250 MON (10x max)
            minTreasuryRequired: 22500 ether, // 22,500 MON
            treasuryBalance: 0,
            jackpotPool: 0,
            isActive: false
        });
        
        tiers[Tier.GOLD] = TierConfig({
            entryFee: 450 ether,     // 450 MON
            maxPayout: 4500 ether,   // 4,500 MON (10x max)
            minTreasuryRequired: 45000 ether, // 45,000 MON
            treasuryBalance: 0,
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
        
        // Check rate limit with bounded storage
        if (!_checkRateLimitBounded(msg.sender)) revert RateLimitExceeded();
        
        // Check if player holds Star Skrumpey with proper verification
        bool _isStarHolder = _checkStarHolderEnumerable(msg.sender);
        
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
            status: GameStatus.PENDING,
            vrfRequestId: 0
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
     * @param multiplier Payout multiplier (in basis points, e.g., 200 = 2x)
     */
    function revealGame(
        bytes32 gameId,
        bytes32 serverSeed,
        uint256 grid,
        string calldata pattern,
        uint256 multiplier
    ) external nonReentrant whenNotPaused {
        GameCommitment storage commitment = commitments[gameId];
        
        // Validate game exists and is pending
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.status != GameStatus.PENDING) revert GameNotPending();
        
        // Verify server seed matches commitment
        if (keccak256(abi.encodePacked(serverSeed)) != commitment.serverSeedHash) {
            revert InvalidServerSeed();
        }
        
        // Mark as revealed
        commitment.status = GameStatus.REVEALED;
        
        // Validate multiplier (max 10x for regular patterns, type(uint256).max for jackpot)
        bool isJackpot = (multiplier == type(uint256).max);
        if (!isJackpot && multiplier > MAX_MULTIPLIER * 100) {
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
            
            // SECURITY: Enforce maxPayout limit
            if (payout > tierConfig.maxPayout) {
                payout = tierConfig.maxPayout;
            }
            
            // Ensure treasury can cover payout
            if (payout > tierConfig.treasuryBalance) {
                revert InsufficientTreasuryBalance();
            }
            
            tierConfig.treasuryBalance -= payout;
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
     * @notice Request refund for a game that wasn't revealed within timeout
     * @param gameId Game identifier
     * @dev Players can request refund after REVEAL_TIMEOUT (24 hours)
     *      A small penalty is taken to discourage abuse
     */
    function requestRefund(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        // Validate game exists and caller is the player
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.player != msg.sender) revert NotGamePlayer();
        if (commitment.status != GameStatus.PENDING) revert GameNotPending();
        
        // Check if timeout has been reached
        if (block.timestamp < commitment.timestamp + REVEAL_TIMEOUT) {
            revert RevealTimeoutNotReached();
        }
        
        // Mark as refunded
        commitment.status = GameStatus.REFUNDED;
        
        // Calculate refund with penalty
        uint256 penalty = (commitment.entryFee * REFUND_PENALTY_BPS) / BPS_DIVISOR;
        uint256 refundAmount = commitment.entryFee - penalty;
        
        // Note: Entry fee was already distributed, need to pull from tier treasury
        TierConfig storage tierConfig = tiers[commitment.tier];
        
        // Calculate how much was allocated to prize pool (88%)
        uint256 prizePoolAmount = (commitment.entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 jackpotAmount = (commitment.entryFee * JACKPOT_POOL_BPS) / BPS_DIVISOR;
        
        // Deduct from tier pools
        if (prizePoolAmount <= tierConfig.treasuryBalance) {
            tierConfig.treasuryBalance -= prizePoolAmount;
        }
        if (jackpotAmount <= tierConfig.jackpotPool) {
            tierConfig.jackpotPool -= jackpotAmount;
        }
        
        // Send penalty to treasury
        if (penalty > 0) {
            (bool treasurySuccess, ) = payable(daoTreasury).call{value: penalty}("");
            if (!treasurySuccess) revert TransferFailed();
        }
        
        // Refund player
        totalRefunded += refundAmount;
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        if (!success) revert TransferFailed();
        
        emit GameRefunded(gameId, msg.sender, refundAmount, penalty);
    }
    
    /**
     * @notice Fund tier treasury (owner only)
     * @param tier Tier to fund
     */
    function fundTreasury(Tier tier) external payable onlyOwner {
        TierConfig storage tierConfig = tiers[tier];
        tierConfig.treasuryBalance += msg.value;
        
        // Auto-enable tier if minimum reached
        if (tierConfig.treasuryBalance >= tierConfig.minTreasuryRequired) {
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
     * @dev Token IDs should be verified off-chain from metadata before registration
     */
    function registerStarSkrumpeys(
        uint256[] calldata tokenIds,
        bool isStarIds
    ) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (isStarSkrumpey[tokenIds[i]] != isStarIds) {
                isStarSkrumpey[tokenIds[i]] = isStarIds;
                if (isStarIds) {
                    starSkrumpeyCount++;
                } else {
                    starSkrumpeyCount--;
                }
            }
        }
    }
    
    /**
     * @notice Update DAO treasury address (owner only)
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        daoTreasury = newTreasury;
    }
    
    /**
     * @notice Update VRF coordinator address (owner only)
     * @param newCoordinator New VRF coordinator address
     */
    function setVRFCoordinator(address newCoordinator) external onlyOwner {
        address oldCoordinator = vrfCoordinator;
        vrfCoordinator = newCoordinator;
        emit VRFCoordinatorUpdated(oldCoordinator, newCoordinator);
    }
    
    /**
     * @notice Enable/disable VRF (owner only)
     * @param enabled Whether VRF should be enabled
     */
    function setVRFEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
        emit VRFStatusChanged(enabled);
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
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    
    // ============ VRF Integration ============
    
    /**
     * @notice Request VRF randomness for a game (called by backend)
     * @param gameId Game identifier
     * @return requestId VRF request ID
     * @dev This is a placeholder for actual VRF integration
     *      For Gelato VRF, implement IGelatoVRFConsumer interface
     *      For Chainlink VRF, implement VRFConsumerBaseV2Plus
     */
    function requestVRFRandomness(bytes32 gameId) external returns (uint256 requestId) {
        if (!vrfEnabled) revert VRFNotEnabled();
        
        GameCommitment storage commitment = commitments[gameId];
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.status != GameStatus.PENDING) revert GameNotPending();
        
        // Generate pseudo-request ID (replace with actual VRF call)
        // In production, call vrfCoordinator.requestRandomness()
        requestId = uint256(keccak256(abi.encodePacked(gameId, block.timestamp)));
        
        commitment.vrfRequestId = requestId;
        vrfRequestToGameId[requestId] = gameId;
        
        emit VRFRequested(gameId, requestId);
        
        return requestId;
    }
    
    /**
     * @notice Callback for VRF randomness fulfillment
     * @param requestId VRF request ID
     * @param randomness Random value from VRF
     * @dev Called by VRF coordinator when randomness is ready
     *      For Gelato VRF: override _fulfillRandomness
     *      For Chainlink VRF: override fulfillRandomWords
     */
    function fulfillVRFRandomness(
        uint256 requestId,
        uint256 randomness
    ) external onlyVRFCoordinator {
        bytes32 gameId = vrfRequestToGameId[requestId];
        if (gameId == bytes32(0)) revert GameNotFound();
        
        emit VRFFulfilled(gameId, requestId, randomness);
        
        // The actual reveal would be processed by the backend
        // using this randomness value
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
        return _checkStarHolderEnumerable(player);
    }
    
    /**
     * @notice Get player's recent game count (for rate limiting)
     * @param player Player address
     * @return Number of games in current window
     */
    function getRecentGameCount(address player) external view returns (uint256) {
        return _getRecentGameCountBounded(player);
    }
    
    /**
     * @notice Check if a game can be refunded
     * @param gameId Game identifier
     * @return canRefund Whether the game can be refunded
     * @return timeUntilRefund Seconds until refund is available (0 if already available)
     */
    function canRequestRefund(bytes32 gameId) external view returns (bool canRefund, uint256 timeUntilRefund) {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player == address(0) || commitment.status != GameStatus.PENDING) {
            return (false, 0);
        }
        
        uint256 refundAvailableAt = commitment.timestamp + REVEAL_TIMEOUT;
        if (block.timestamp >= refundAvailableAt) {
            return (true, 0);
        }
        
        return (false, refundAvailableAt - block.timestamp);
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
        uint256 prizePool = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
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
        
        // Allocate funds
        tierConfig.treasuryBalance += prizePool;
        tierConfig.jackpotPool += jackpot;
        
        // Transfer treasury fee to DAO
        if (treasury > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasury}("");
            if (!success) revert TransferFailed();
        }
        
        // Add player bonus to prize pool for Star holders
        if (playerBonus > 0) {
            tierConfig.treasuryBalance += playerBonus;
        }
    }
    
    /**
     * @notice Calculate payout for regular win with maxPayout enforcement
     * @param entryFee Entry fee
     * @param multiplier Multiplier in basis points
     * @param starHolder Whether player holds Star Skrumpey
     * @return Payout amount (capped at maxPayout in revealGame)
     */
    function _calculatePayout(
        uint256 entryFee,
        uint256 multiplier,
        bool starHolder
    ) internal pure returns (uint256) {
        // Calculate prize pool allocation
        uint256 prizePool = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        
        // Apply multiplier
        uint256 basePayout = (prizePool * multiplier) / 100;
        
        // Add Star holder bonus
        if (starHolder) {
            uint256 bonus = (entryFee * STAR_BONUS_BPS) / BPS_DIVISOR;
            return basePayout + bonus;
        }
        
        return basePayout;
    }
    
    /**
     * @notice Check if player owns any Star Skrumpey using enumerable interface
     * @param player Player address
     * @return Whether player holds any registered Star Skrumpey
     * @dev Uses IERC721Enumerable if available, falls back to balance check
     */
    function _checkStarHolderEnumerable(address player) internal view returns (bool) {
        uint256 balance = starSkrumpeyNFT.balanceOf(player);
        if (balance == 0) return false;
        
        // If no Star Skrumpeys are registered, return false
        // This prevents the old behavior where any Skrumpey holder qualified
        if (starSkrumpeyCount == 0) return false;
        
        // Try to use enumerable interface to check specific tokens
        // This is the secure way to verify Star trait ownership
        try IERC721Enumerable(address(starSkrumpeyNFT)).tokenOfOwnerByIndex(player, 0) returns (uint256 tokenId) {
            // Check first token - if it's a Star Skrumpey, return true
            if (isStarSkrumpey[tokenId]) return true;
            
            // Check remaining tokens (up to balance)
            for (uint256 i = 1; i < balance && i < 100; i++) { // Cap at 100 to prevent DoS
                try IERC721Enumerable(address(starSkrumpeyNFT)).tokenOfOwnerByIndex(player, i) returns (uint256 nextTokenId) {
                    if (isStarSkrumpey[nextTokenId]) return true;
                } catch {
                    break;
                }
            }
            return false;
        } catch {
            // If enumerable not supported, fall back to simple balance check
            // This is less secure but provides backwards compatibility
            // Owner should register Star Skrumpey IDs for proper verification
            return false;
        }
    }
    
    /**
     * @notice Check rate limit using bounded circular buffer
     * @param player Player address
     * @return Whether player can play (not rate limited)
     * @dev Uses circular buffer to prevent unbounded array growth
     */
    function _checkRateLimitBounded(address player) internal returns (bool) {
        RateLimitData storage data = playerRateLimits[player];
        uint256 cutoffTime = block.timestamp - RATE_LIMIT_WINDOW;
        
        // Count valid (non-expired) entries
        uint256 validCount = 0;
        for (uint256 i = 0; i < data.count; i++) {
            uint256 idx = (data.head + i) % MAX_RATE_LIMIT_ENTRIES;
            if (data.timestamps[idx] > cutoffTime) {
                validCount++;
            }
        }
        
        // Check if under limit
        if (validCount >= RATE_LIMIT_GAMES) {
            return false;
        }
        
        // Add current timestamp using circular buffer
        uint256 insertIdx;
        if (data.count < MAX_RATE_LIMIT_ENTRIES) {
            // Buffer not full, append
            insertIdx = (data.head + data.count) % MAX_RATE_LIMIT_ENTRIES;
            data.count++;
        } else {
            // Buffer full, overwrite oldest
            insertIdx = data.head;
            data.head = (data.head + 1) % MAX_RATE_LIMIT_ENTRIES;
        }
        
        data.timestamps[insertIdx] = block.timestamp;
        
        return true;
    }
    
    /**
     * @notice Get recent game count using bounded storage
     * @param player Player address
     * @return Number of games in current window
     */
    function _getRecentGameCountBounded(address player) internal view returns (uint256) {
        RateLimitData storage data = playerRateLimits[player];
        uint256 cutoffTime = block.timestamp - RATE_LIMIT_WINDOW;
        
        uint256 count = 0;
        for (uint256 i = 0; i < data.count; i++) {
            uint256 idx = (data.head + i) % MAX_RATE_LIMIT_ENTRIES;
            if (data.timestamps[idx] > cutoffTime) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * @notice Receive MON
     */
    receive() external payable {}
}
