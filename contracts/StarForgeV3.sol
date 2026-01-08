// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IVRFCoordinator
 * @notice Interface for VRF Coordinator (Gelato VRF, Chainlink VRF, or Chronicle)
 */
interface IVRFCoordinator {
    function requestRandomness(bytes memory data) external returns (uint256);
}

/**
 * @title StarForgeV3
 * @author Star World Order DAO
 * @notice Production-ready provably fair 5x5 constellation grid game on Monad
 * @dev Commit-reveal RNG game with VRF integration and comprehensive security fixes
 * 
 * Key Features:
 * - 5x5 grid reveal game with star patterns
 * - Commit-reveal + VRF for provable fairness
 * - 3 tiers: Bronze (45 MON), Silver (225 MON), Gold (450 MON)
 * - Pattern-based payouts up to 10x
 * - Jackpot pool for Supernova (all 25 stars)
 * - Star trait holders get better RTP (3% bonus)
 * - Per-tier pause capability
 * - Timelocked emergency withdrawals
 * 
 * Fee Distribution:
 * - 88% → Prize pool (regular wins)
 * - 5% → Jackpot pool (Supernova only)
 * - 7% → Treasury (standard players)
 * - 4% → Treasury (Star holders) - 3% surplus retained in prize pool for bonuses
 * 
 * Security Improvements (V3):
 * - FIX #1: Use coordinator's VRF requestId (not internal counter)
 * - FIX #2: VRF requirement is per-game based on commitment, not global toggle
 * - FIX #3: Bind patternId & multiplier to commit via domain-separated hash
 * - FIX #4: Jackpot path verifies grid is full (all 25 bits set)
 * - FIX #5: Consistent prize pool math with star bonus semantics
 * - FIX #6: Added setDaoTreasury admin setter
 * - FIX #7: Revoke VRF_ROLE when updating coordinator
 * - FIX #8: Type-safe rate limiter with uint64 cast
 * - FIX #9: Indexed patternId in GameRevealed event for analytics
 * - FIX #10: Specific error types for VRF reveal path
 * - FIX #11: Star Holder bonus now funded from treasury savings (3% retained in prize pool)
 * - FIX #12: Jackpot requires VRF validation (prevents operator manipulation)
 * - FIX #13: Removed gas-heavy getStarTokens (use off-chain indexer)
 * - FIX #14: Added solvency cap on payouts (prevents insolvency)
 * - FIX #15: Simplified rate limiting with compact uint32[10] storage (gas optimization)
 * 
 * Deployed on Monad (Chain ID: 143)
 */
contract StarForgeV3 is ReentrancyGuard, AccessControl, Pausable {
    
    // ============ Roles ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VRF_ROLE = keccak256("VRF_ROLE");

    // ============ Constants ============
    
    /// @notice Domain separator for commit hash validation (FIX #3)
    bytes32 public constant COMMIT_DOMAIN = keccak256("STARFORGE_V3");
    
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
    
    /// @notice Multiplier divisor (multipliers are in percent*100, e.g., 200 = 2x)
    uint256 public constant MULTIPLIER_DIVISOR = 100;
    
    /// @notice Rate limit: max games per time window
    uint256 public constant RATE_LIMIT_GAMES = 10;
    
    /// @notice Rate limit time window (1 minute)
    uint256 public constant RATE_LIMIT_WINDOW = 1 minutes;
    
    /// @notice Refund window duration (24 hours)
    uint256 public constant REFUND_WINDOW = 24 hours;
    
    /// @notice Reveal timeout after VRF fulfillment (1 hour)
    uint256 public constant REVEAL_TIMEOUT = 1 hours;
    
    /// @notice Withdrawal timelock duration (24 hours)
    uint256 public constant WITHDRAWAL_TIMELOCK = 24 hours;

    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract for trait verification
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice DAO Treasury address for fee collection
    address public daoTreasury;
    
    /// @notice VRF Coordinator contract
    IVRFCoordinator public vrfCoordinator;
    
    /// @notice Whether VRF is enabled globally (new games will use VRF if enabled)
    bool public vrfEnabled;

    /// @notice Tier configuration struct
    struct TierConfig {
        uint256 entryFee;           
        uint256 maxPayout;          
        uint256 minTreasuryRequired;
        uint256 prizePool;          
        uint256 jackpotPool;        
        bool isActive;   
        bool isPaused;           
    }
    
    /// @notice Tier enum
    enum Tier { BRONZE, SILVER, GOLD }
    
    /// @notice Tier configurations mapping
    mapping(Tier => TierConfig) public tiers;
    
    /// @notice Game commitment struct
    struct GameCommitment {
        address player;
        Tier tier;
        uint256 entryFee;
        bytes32 serverSeedHash;  // Now: keccak256(COMMIT_DOMAIN, serverSeed, patternId, multiplier)
        uint256 nonce;
        uint256 timestamp;
        bool isStarHolder;
        bool revealed;
        uint256 vrfRequestId;       
        bool vrfFulfilled;          
        uint256 vrfFulfillmentTimestamp; 
        uint256 starTokenId;        
    }
    
    /// @notice Game commitments by game ID
    mapping(bytes32 => GameCommitment) public commitments;
    
    /// @notice Player nonces for game uniqueness
    mapping(address => uint256) public playerNonces;
    
    /// @notice FIX #15: Simplified rate limiting (last 10 timestamps only)
    /// @dev Uses compact storage: 10 uint32 timestamps (sufficient until year 2106)
    struct RateLimit {
        uint32[10] stamps;  // Last 10 game timestamps
        uint8 count;        // Number of valid entries (0-10)
        uint8 head;         // Circular buffer head position
    }
    mapping(address => RateLimit) private rateLimits;
    
    // Stats
    uint256 public totalGamesPlayed;
    uint256 public totalWagered;
    uint256 public totalPaidOut;
    
    /// @notice Star Skrumpey token IDs with Star trait
    mapping(uint256 => bool) public isStarSkrumpey;
    
    // VRF mappings
    mapping(bytes32 => uint256) public vrfRandomness;
    mapping(uint256 => bytes32) public vrfRequestToGame;
    
    // Solvency & Safety
    mapping(bytes32 => bool) public refundProcessed;
    uint256 public totalPendingEntryFees;
    uint256 public accumulatedTreasuryFees;

    /// @notice Emergency withdrawal request struct
    struct WithdrawalRequest {
        uint256 amount;
        uint256 unlockTimestamp;
        bool pending;
    }
    WithdrawalRequest public withdrawalRequest;
    
    // ============ Events ============
    
    event GameCommitted(
        bytes32 indexed gameId, 
        address indexed player, 
        Tier tier, 
        uint256 entryFee, 
        bytes32 serverSeedHash, 
        uint256 nonce, 
        bool isStarHolder
    );
    
    /// @notice FIX #9: Added indexed patternId for analytics
    event GameRevealed(
        bytes32 indexed gameId, 
        address indexed player, 
        Tier tier, 
        uint256 grid, 
        uint8 indexed patternId, 
        uint256 multiplier, 
        uint256 payout, 
        bool isJackpot
    );
    
    event JackpotWon(bytes32 indexed gameId, address indexed winner, Tier tier, uint256 amount);
    event TierUpdated(Tier tier, uint256 entryFee, uint256 maxPayout, uint256 minTreasuryRequired);
    event TierStatusChanged(Tier tier, bool isActive, bool isPaused);
    event TreasuryFunded(Tier tier, uint256 amount);
    event JackpotSeeded(Tier tier, uint256 amount);
    event VRFRequested(bytes32 indexed gameId, uint256 indexed requestId);
    event VRFFulfilled(bytes32 indexed gameId, uint256 indexed requestId, uint256 randomness);
    event RefundIssued(bytes32 indexed gameId, address indexed player, uint256 amount);
    event TreasuryTransferFailed(uint256 amount);
    event AccumulatedFeesWithdrawn(address indexed recipient, uint256 amount);
    event GameForcedReveal(bytes32 indexed gameId, address indexed player, uint256 refundAmount);
    event WithdrawalRequested(uint256 amount, uint256 unlockTime);
    event WithdrawalExecuted(address indexed recipient, uint256 amount);
    event VRFCoordinatorUpdated(address indexed newCoordinator);
    event DaoTreasuryUpdated(address indexed newTreasury);

    // ============ Errors ============
    
    error InvalidTier();
    error TierNotActive();
    error TierPaused();
    error InsufficientTreasuryBalance();
    error InvalidEntryFee();
    error GameAlreadyRevealed();
    error GameNotFound();
    error InvalidServerSeed();
    error RateLimitExceeded();
    error InvalidPayout();
    error InsufficientJackpotPool();
    error TransferFailed();
    error InsufficientSurplus(); 
    error Unauthorized();  
    error RefundWindowNotReached();  
    error RefundAlreadyProcessed(); 
    error ZeroAddress();
    error InvalidStarToken();  
    error WithdrawalLocked();
    error NoWithdrawalPending();
    /// @notice FIX #10: Specific VRF errors for better debugging
    error VRFNotConfigured();
    error VRFNotFulfilled();
    error VRFRevealTimeoutNotReached();
    error VRFRequestFailed();
    /// @notice FIX #4: Invalid jackpot grid error
    error InvalidJackpotGrid();
    /// @notice FIX #12: Jackpot requires VRF
    error JackpotRequiresVRF();

    // ============ Constructor ============

    constructor(
        address _starSkrumpeyNFT,
        address _daoTreasury,
        address _vrfCoordinator,
        address _admin
    ) {
        if (_starSkrumpeyNFT == address(0) || _daoTreasury == address(0) || _admin == address(0)) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        
        // If VRF coordinator is provided, grant role
        if (_vrfCoordinator != address(0)) {
            vrfCoordinator = IVRFCoordinator(_vrfCoordinator);
            _grantRole(VRF_ROLE, _vrfCoordinator);
        }

        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        daoTreasury = _daoTreasury;
        
        // Initialize tiers
        _initTier(Tier.BRONZE, 45 ether, 450 ether, 4500 ether);
        _initTier(Tier.SILVER, 225 ether, 2250 ether, 22500 ether);
        _initTier(Tier.GOLD, 450 ether, 4500 ether, 45000 ether);
    }

    function _initTier(Tier tier, uint256 fee, uint256 maxPay, uint256 minTreasury) private {
        tiers[tier] = TierConfig({
            entryFee: fee,
            maxPayout: maxPay,
            minTreasuryRequired: minTreasury,
            prizePool: 0,
            jackpotPool: 0,
            isActive: false,
            isPaused: false
        });
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Commit to a new game
     * @param _tier Game tier (Bronze/Silver/Gold)
     * @param serverSeedHash Server seed hash - MUST be keccak256(COMMIT_DOMAIN, serverSeed, patternId, multiplier)
     * @param starTokenId Optional Star Skrumpey token ID for bonus (0 if not claiming)
     * @return gameId Unique game identifier
     * @dev FIX #3: serverSeedHash now binds patternId and multiplier at commit time
     */
    function commitGame(
        Tier _tier,
        bytes32 serverSeedHash,
        uint256 starTokenId
    ) external payable nonReentrant whenNotPaused returns (bytes32 gameId) {
        TierConfig storage tierConfig = tiers[_tier];
        
        if (!tierConfig.isActive) revert TierNotActive();
        if (tierConfig.isPaused) revert TierPaused();
        if (msg.value != tierConfig.entryFee) revert InvalidEntryFee();
        
        if (!_checkRateLimit(msg.sender)) revert RateLimitExceeded();
        
        // Check if player holds Star Skrumpey (O(1) verification)
        bool _isStarHolder = false;
        if (starTokenId > 0) {
            _isStarHolder = _checkStarHolderWithToken(msg.sender, starTokenId);
        }
        
        uint256 nonce = playerNonces[msg.sender]++;
        gameId = keccak256(abi.encodePacked(msg.sender, _tier, nonce, block.timestamp, serverSeedHash));
        
        // Update stats
        totalWagered += msg.value;
        totalPendingEntryFees += msg.value;

        // Store commitment
        GameCommitment storage c = commitments[gameId];
        c.player = msg.sender;
        c.tier = _tier;
        c.entryFee = msg.value;
        c.serverSeedHash = serverSeedHash;
        c.nonce = nonce;
        c.timestamp = block.timestamp;
        c.isStarHolder = _isStarHolder;
        c.starTokenId = starTokenId;

        // NOTE: Fees are NOT distributed here. Distributed on reveal for 100% refund capability.

        emit GameCommitted(gameId, msg.sender, _tier, msg.value, serverSeedHash, nonce, _isStarHolder);
        
        // Trigger VRF if enabled
        if (vrfEnabled) {
             _requestVRF(gameId);
        }
    }
    
    /**
     * @notice Reveal game result and process payout
     * @param gameId Game identifier
     * @param serverSeed Server seed (must match hash when combined with domain, patternId, multiplier)
     * @param grid 25-bit grid result
     * @param patternId Pattern identifier
     * @param multiplier Payout multiplier (type(uint256).max for jackpot)
     * @dev FIX #2: VRF requirement is per-game based on commitment.vrfRequestId
     * @dev FIX #3: Validates keccak256(COMMIT_DOMAIN, serverSeed, patternId, multiplier) == serverSeedHash
     * @dev FIX #4: Jackpot requires grid == ((1 << 25) - 1) (all stars)
     */
    function revealGame(
        bytes32 gameId,
        bytes32 serverSeed,
        uint256 grid,
        uint8 patternId,
        uint256 multiplier
    ) external nonReentrant whenNotPaused {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.revealed) revert GameAlreadyRevealed();
        
        // FIX #3: Validate server seed with domain separator, patternId, and multiplier bound at commit
        if (keccak256(abi.encodePacked(COMMIT_DOMAIN, serverSeed, patternId, multiplier)) != commitment.serverSeedHash) {
            revert InvalidServerSeed();
        }
        
        // FIX #2: VRF requirement is per-game (based on whether VRF was requested), not global toggle
        if (commitment.vrfRequestId != 0) {
            // VRF was requested for this game, so we must validate
            if (!commitment.vrfFulfilled) revert VRFNotFulfilled();
            uint256 expectedGrid = _generateGridFromVRF(vrfRandomness[gameId], serverSeed);
            if (grid != expectedGrid) revert InvalidServerSeed();
        }
        
        // Mark revealed and decrement pending
        commitment.revealed = true;
        totalPendingEntryFees -= commitment.entryFee;
        totalGamesPlayed++;

        // --- Fee Distribution & Payout Logic ---
        
        bool isJackpot = (multiplier == type(uint256).max);
        if (!isJackpot && multiplier > MAX_MULTIPLIER * MULTIPLIER_DIVISOR) revert InvalidPayout();

        TierConfig storage tierConfig = tiers[commitment.tier];
        uint256 payout = 0;

        // Calculate deductions (Treasury & Jackpot)
        uint256 treasuryAmount;
        uint256 jackpotAlloc = (commitment.entryFee * JACKPOT_POOL_BPS) / BPS_DIVISOR;
        
        // FIX #11: Star holders pay 4% treasury, creating 3% surplus that funds their bonus
        // This 3% is added to prize pool to maintain solvency when bonuses are paid
        uint256 netStake;
        if (commitment.isStarHolder) {
            treasuryAmount = (commitment.entryFee * TREASURY_STAR_BPS) / BPS_DIVISOR; // 4%
            // 91% goes to pools (88% base + 3% to cover star bonus)
            netStake = (commitment.entryFee * (PRIZE_POOL_BPS + STAR_BONUS_BPS)) / BPS_DIVISOR;
        } else {
            treasuryAmount = (commitment.entryFee * TREASURY_STANDARD_BPS) / BPS_DIVISOR; // 7%
            // Standard 88% to prize pool
            netStake = (commitment.entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        }
        
        tierConfig.prizePool += netStake;

        // Update Jackpot Pool
        tierConfig.jackpotPool += jackpotAlloc;

        // Distribute Treasury (Soft fail to prevent DoS)
        if (treasuryAmount > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasuryAmount}("");
            if (!success) {
                accumulatedTreasuryFees += treasuryAmount;
                emit TreasuryTransferFailed(treasuryAmount);
            }
        }

        // Calculate Payout
        if (isJackpot) {
            // FIX #4: Verify grid is full (all 25 stars lit) for jackpot
            if (grid != ((1 << 25) - 1)) revert InvalidJackpotGrid();
            
            // FIX #12: Jackpot REQUIRES VRF validation to prevent operator manipulation
            if (commitment.vrfRequestId == 0) revert JackpotRequiresVRF();
            
            payout = tierConfig.jackpotPool;
            if (payout == 0) revert InsufficientJackpotPool();
            tierConfig.jackpotPool = 0;
            emit JackpotWon(gameId, commitment.player, commitment.tier, payout);
        } else if (multiplier > 0) {
            // FIX #14: Calculate payout with star bonus
            payout = _calculatePayout(commitment.entryFee, multiplier, commitment.isStarHolder);
            
            // Cap at max payout configuration
            if (payout > tierConfig.maxPayout) payout = tierConfig.maxPayout;
            
            // FIX #14: Solvency check - cap payout at available pool to prevent revert/DoS
            if (payout > tierConfig.prizePool) {
                payout = tierConfig.prizePool;
            }
            
            tierConfig.prizePool -= payout;
        }

        // Transfer Payout
        if (payout > 0) {
            totalPaidOut += payout;
            (bool success, ) = payable(commitment.player).call{value: payout}("");
            if (!success) revert TransferFailed();
        }
        
        emit GameRevealed(gameId, commitment.player, commitment.tier, grid, patternId, multiplier, payout, isJackpot);
    }
    
    /**
     * @notice Request refund for unrevealed game after refund window
     * @param gameId Game identifier
     */
    function requestRefund(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundProcessed[gameId]) revert RefundAlreadyProcessed();
        
        // Standard refund window check
        if (block.timestamp < commitment.timestamp + REFUND_WINDOW) revert RefundWindowNotReached();
        
        _processFullRefund(gameId, commitment);
    }

    /**
     * @notice Force reveal a game after VRF timeout
     * @dev Pays back 100% of entry fee because fees were never distributed
     */
    function forceReveal(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundProcessed[gameId]) revert RefundAlreadyProcessed();
        
        // FIX #10: VRF specific checks with clear errors
        if (commitment.vrfRequestId == 0) revert VRFNotConfigured();
        if (!commitment.vrfFulfilled) revert VRFNotFulfilled();
        if (block.timestamp < commitment.vrfFulfillmentTimestamp + REVEAL_TIMEOUT) {
            revert VRFRevealTimeoutNotReached();
        }
        
        _processFullRefund(gameId, commitment);
        emit GameForcedReveal(gameId, msg.sender, commitment.entryFee);
    }

    // ============ Admin Functions ============

    /**
     * @notice Secure 2-step emergency withdraw to prevent rug pulls
     */
    function requestEmergencyWithdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (withdrawalRequest.pending) revert WithdrawalLocked();
        
        // Solvency Check: Can only withdraw SURPLUS
        uint256 totalLiabilities = totalPendingEntryFees + accumulatedTreasuryFees;
        for (uint256 i = 0; i < 3; i++) {
            Tier tier = Tier(i);
            totalLiabilities += tiers[tier].prizePool + tiers[tier].jackpotPool;
        }
        
        if (address(this).balance < totalLiabilities + amount) revert InsufficientSurplus();

        withdrawalRequest = WithdrawalRequest({
            amount: amount,
            unlockTimestamp: block.timestamp + WITHDRAWAL_TIMELOCK,
            pending: true
        });

        emit WithdrawalRequested(amount, withdrawalRequest.unlockTimestamp);
    }

    function executeEmergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (!withdrawalRequest.pending) revert NoWithdrawalPending();
        if (block.timestamp < withdrawalRequest.unlockTimestamp) revert WithdrawalLocked();
        
        uint256 amount = withdrawalRequest.amount;
        withdrawalRequest.pending = false;
        withdrawalRequest.amount = 0;

        // Double check solvency at execution time
        uint256 totalLiabilities = totalPendingEntryFees + accumulatedTreasuryFees;
        for (uint256 i = 0; i < 3; i++) {
            Tier tier = Tier(i);
            totalLiabilities += tiers[tier].prizePool + tiers[tier].jackpotPool;
        }
        
        if (address(this).balance < totalLiabilities + amount) revert InsufficientSurplus();

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit WithdrawalExecuted(msg.sender, amount);
    }

    /**
     * @notice FIX #6: Set DAO treasury address
     * @param newTreasury New treasury address
     */
    function setDaoTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        daoTreasury = newTreasury;
        emit DaoTreasuryUpdated(newTreasury);
    }

    /**
     * @notice FIX #7: Set VRF coordinator with proper role management
     * @param _coordinator New VRF coordinator address
     */
    function setVRFCoordinator(address _coordinator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_coordinator == address(0)) revert ZeroAddress();
        
        // FIX #7: Revoke role from old coordinator (if any)
        address old = address(vrfCoordinator);
        if (old != address(0)) {
            _revokeRole(VRF_ROLE, old);
        }
        
        vrfCoordinator = IVRFCoordinator(_coordinator);
        _grantRole(VRF_ROLE, _coordinator);
        emit VRFCoordinatorUpdated(_coordinator);
    }

    function fundTreasury(Tier tier) external payable onlyRole(OPERATOR_ROLE) {
        TierConfig storage tierConfig = tiers[tier];
        tierConfig.prizePool += msg.value;
        if (tierConfig.prizePool >= tierConfig.minTreasuryRequired && !tierConfig.isActive) {
            tierConfig.isActive = true;
            emit TierStatusChanged(tier, true, tierConfig.isPaused);
        }
        emit TreasuryFunded(tier, msg.value);
    }

    function seedJackpot(Tier tier) external payable onlyRole(OPERATOR_ROLE) {
        tiers[tier].jackpotPool += msg.value;
        emit JackpotSeeded(tier, msg.value);
    }

    function updateTier(Tier tier, uint256 entryFee, uint256 maxPayout, uint256 minTreasury) external onlyRole(OPERATOR_ROLE) {
        TierConfig storage tc = tiers[tier];
        tc.entryFee = entryFee;
        tc.maxPayout = maxPayout;
        tc.minTreasuryRequired = minTreasury;
        emit TierUpdated(tier, entryFee, maxPayout, minTreasury);
    }

    function setTierStatus(Tier tier, bool isActive, bool isPaused) external onlyRole(OPERATOR_ROLE) {
        tiers[tier].isActive = isActive;
        tiers[tier].isPaused = isPaused;
        emit TierStatusChanged(tier, isActive, isPaused);
    }

    function registerStarSkrumpeys(uint256[] calldata tokenIds, bool isStarIds) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            isStarSkrumpey[tokenIds[i]] = isStarIds;
        }
    }

    function setVRFEnabled(bool enabled) external onlyRole(OPERATOR_ROLE) {
        vrfEnabled = enabled;
    }

    function withdrawAccumulatedFees() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 amount = accumulatedTreasuryFees;
        if (amount == 0) revert InsufficientSurplus();
        accumulatedTreasuryFees = 0;
        (bool success, ) = payable(daoTreasury).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit AccumulatedFeesWithdrawn(daoTreasury, amount);
    }
    
    /**
     * @notice Get contract solvency status
     * @return totalAssets Total ETH in contract
     * @return totalLiabilities Total committed liabilities
     * @return surplus Available surplus (can be negative if insolvent)
     * @dev Added for transparency and monitoring
     */
    function getSolvencyStatus() external view returns (
        uint256 totalAssets,
        uint256 totalLiabilities, 
        int256 surplus
    ) {
        totalAssets = address(this).balance;
        totalLiabilities = totalPendingEntryFees + accumulatedTreasuryFees;
        
        for (uint256 i = 0; i < 3; i++) {
            Tier tier = Tier(i);
            totalLiabilities += tiers[tier].prizePool + tiers[tier].jackpotPool;
        }
        
        surplus = int256(totalAssets) - int256(totalLiabilities);
    }

    function pause() external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }

    // ============ VRF Logic ============

    /**
     * @notice FIX #1: Request VRF using coordinator's requestId (not internal counter)
     * @param gameId Game identifier
     */
    function _requestVRF(bytes32 gameId) internal {
        if (address(vrfCoordinator) == address(0)) revert VRFNotConfigured();
        
        // FIX #1: Use the coordinator's returned requestId, not an internal counter
        uint256 coordinatorRequestId;
        try vrfCoordinator.requestRandomness(abi.encode(gameId)) returns (uint256 rid) {
            coordinatorRequestId = rid;
        } catch {
            revert VRFRequestFailed();
        }
        
        commitments[gameId].vrfRequestId = coordinatorRequestId;
        vrfRequestToGame[coordinatorRequestId] = gameId;
        
        emit VRFRequested(gameId, coordinatorRequestId);
    }

    /**
     * @notice Fulfill VRF randomness callback (called by VRF coordinator)
     * @param requestId VRF request ID from coordinator
     * @param randomness Random value
     */
    function fulfillVRFRandomness(uint256 requestId, uint256 randomness) external onlyRole(VRF_ROLE) {
        bytes32 gameId = vrfRequestToGame[requestId];
        if (gameId == bytes32(0)) revert GameNotFound();
        
        GameCommitment storage commitment = commitments[gameId];
        vrfRandomness[gameId] = randomness;
        commitment.vrfFulfilled = true;
        commitment.vrfFulfillmentTimestamp = block.timestamp;
        
        emit VRFFulfilled(gameId, requestId, randomness);
    }

    // ============ Internal Helpers ============

    function _processFullRefund(bytes32 gameId, GameCommitment storage commitment) internal {
        refundProcessed[gameId] = true;
        commitment.revealed = true;
        totalPendingEntryFees -= commitment.entryFee;

        // Since we didn't distribute fees on commit, we just return the full amount
        (bool success, ) = payable(msg.sender).call{value: commitment.entryFee}("");
        if (!success) revert TransferFailed();
        
        emit RefundIssued(gameId, msg.sender, commitment.entryFee);
    }

    /**
     * @notice FIX #15: Simplified rate limit check with compact storage
     * @param player Player address
     * @return Whether player can play
     * @dev Uses 10 uint32 timestamps instead of 20 uint64 for gas efficiency
     */
    function _checkRateLimit(address player) internal returns (bool) {
        RateLimit storage r = rateLimits[player];
        uint32 currentTime = uint32(block.timestamp);
        uint32 cutoff = uint32(block.timestamp - RATE_LIMIT_WINDOW);
        
        // Count valid entries within time window
        uint256 valid = 0;
        for (uint256 i = 0; i < r.count; i++) {
            if (r.stamps[i] > cutoff) valid++;
        }
        
        // Check if limit exceeded
        if (valid >= RATE_LIMIT_GAMES) return false;
        
        // Add new timestamp to circular buffer
        r.stamps[r.head] = currentTime;
        r.head = uint8((r.head + 1) % RATE_LIMIT_GAMES);
        if (r.count < RATE_LIMIT_GAMES) {
            r.count++;
        }
        
        return true;
    }

    /**
     * @notice FIX #11: Calculate payout - Star bonus is now pre-funded in prize pool
     * @param entryFee Entry fee
     * @param multiplier Multiplier in percent*100 (200 = 2x)
     * @param starHolder Whether player is star holder
     * @return Payout amount
     * @dev For star holders: 91% allocated to prize pool (88% base + 3% bonus fund)
     *      Payout = (88% * multiplier) + 3% bonus
     *      All funds come from prize pool (which was funded with the 91%)
     */
    function _calculatePayout(uint256 entryFee, uint256 multiplier, bool starHolder) internal pure returns (uint256) {
        // Base calculation on the Prize Pool allocation (88% of entry)
        uint256 prizePoolShare = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 basePayout = (prizePoolShare * multiplier) / MULTIPLIER_DIVISOR;
        
        if (starHolder) {
            // Star holders get an additional 3% bonus on their entry fee
            // This is funded by the extra 3% allocated to prize pool at reveal
            uint256 bonus = (entryFee * STAR_BONUS_BPS) / BPS_DIVISOR;
            return basePayout + bonus;
        }
        return basePayout;
    }

    function _checkStarHolderWithToken(address player, uint256 tokenId) internal view returns (bool) {
        if (!isStarSkrumpey[tokenId]) revert InvalidStarToken();
        try starSkrumpeyNFT.ownerOf(tokenId) returns (address owner) {
            if (owner != player) revert InvalidStarToken();
            return true;
        } catch {
            revert InvalidStarToken();
        }
    }

    function _generateGridFromVRF(uint256 randomness, bytes32 seed) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(randomness, seed))) & ((1 << 25) - 1);
    }

    // ============ View Helpers for Frontend ============
    
    /**
     * @notice FIX #13: getStarTokens REMOVED - Use off-chain indexer instead
     * @dev The previous implementation was:
     *      - Gas intensive (O(n) iteration)
     *      - Unreliable (capped at 20 tokens, missing tokens beyond that)
     *      - Unsuitable for production
     *      
     *      RECOMMENDATION: Use The Graph, Goldsky, or similar indexer service
     *      to track Star Skrumpey ownership off-chain and query via API.
     *      
     *      For on-chain verification, use _checkStarHolderWithToken() with
     *      a known tokenId (provided by frontend/indexer).
     */

    function getTimeUntilForceReveal(bytes32 gameId) external view returns (uint256) {
        GameCommitment memory c = commitments[gameId];
        if (!c.vrfFulfilled) return 0;
        uint256 unlockTime = c.vrfFulfillmentTimestamp + REVEAL_TIMEOUT;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }
    
    function getTimeUntilRefund(bytes32 gameId) external view returns (uint256) {
        GameCommitment memory c = commitments[gameId];
        if (c.player == address(0)) return 0;
        uint256 unlockTime = c.timestamp + REFUND_WINDOW;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

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
     * @notice Receive MON
     */
    receive() external payable {}
}
