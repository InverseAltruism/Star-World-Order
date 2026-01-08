// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title IVRFCoordinator
 * @notice Interface for VRF Coordinator (Gelato VRF, Chainlink VRF, or Chronicle)
 * @dev Ensure your specific provider supports this interface
 */
interface IVRFCoordinator {
    function requestRandomness(bytes memory data) external returns (uint256);
}

/**
 * @title StarForgeV5
 * @author Star World Order DAO
 * @notice Production-ready provably fair 5x5 constellation grid game on Monad
 * @dev Commit-reveal RNG game with VRF integration and comprehensive security fixes
 * 
 * SECURITY AUDIT FIXES IN V5:
 * ===========================
 * 
 * CRITICAL FIXES:
 * - FIX #1: Signature domain separation - Added chainId + address(this) to prevent cross-chain/contract replay
 * - FIX #2: VRF fulfillment guard - Prevents overwriting already fulfilled VRF data
 * - FIX #3: Rate limit ring buffer - Fixed wrap-around logic for correct counting
 * - FIX #4: Non-VRF outcomes disabled - VRF is now REQUIRED, no operator-controlled fallback
 * - FIX #5: serverSeedHash reuse prevention - Tracks used seed hashes to prevent replay
 * - FIX #6: VRF callback address validation - Only exact coordinator address can fulfill
 * 
 * INHERITED FIXES FROM V3/V4:
 * - Star Holder accounting solvency (91% to prize pool)
 * - Jackpot requires VRF validation
 * - Payout capping to prevent DoS
 * - Gas-optimized rate limiting
 * - Dynamic multiplier calculation from grid
 * - Timelocked emergency withdrawals
 * - Per-tier pause capability
 * 
 * PROVABLY FAIR GUARANTEE:
 * - Grid is derived from VRF randomness XOR server seed
 * - Multiplier is calculated on-chain from grid pattern
 * - No server-side manipulation possible with VRF enabled
 * 
 * Chain: Monad (Chain ID: 143)
 */
contract StarForgeV5 is ReentrancyGuard, AccessControl, Pausable {
    using ECDSA for bytes32;

    // ============ Roles ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VRF_ROLE = keccak256("VRF_ROLE");

    // ============ Constants ============
    
    /// @notice Contract version for domain separation
    string public constant VERSION = "STARFORGE_V5";
    
    /// @notice Domain separator for EIP-712 style signing
    /// @dev Computed at construction: keccak256(VERSION, chainId, address(this))
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    /// @notice Commit domain for server seed hashing (backward compatible)
    bytes32 public constant COMMIT_DOMAIN = keccak256("STARFORGE_V5");
    
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
    
    /// @notice Signature validity period (10 minutes)
    uint256 public constant SIGNATURE_VALIDITY = 10 minutes;

    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract for trait verification
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice DAO Treasury address for fee collection
    address public daoTreasury;
    
    /// @notice VRF Coordinator contract
    IVRFCoordinator public vrfCoordinator;

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
        bytes32 serverSeedHash;
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
    
    /// @notice FIX #5: Used server seed hashes to prevent replay
    mapping(bytes32 => bool) public usedServerSeedHashes;
    
    /// @notice FIX #3: Compact rate limiting storage with correct wrap-around
    struct RateLimit {
        uint32[10] stamps;  // Last 10 game timestamps (circular buffer)
        uint8 head;         // Next write position
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
    event VRFCoordinatorUpdated(address indexed oldCoordinator, address indexed newCoordinator);
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
    error VRFNotConfigured();
    error VRFNotFulfilled();
    error VRFRevealTimeoutNotReached();
    error VRFRequestFailed();
    error VRFAlreadyFulfilled();  // FIX #2: New error for double fulfillment
    error InvalidJackpotGrid();
    error JackpotRequiresVRF();
    error InvalidPattern();
    error SignatureExpired();
    error SignatureValidityTooLong();  // Signature expiration too far in future
    error InvalidSignature();
    error InsufficientFundsForPayout();
    error InsufficientFundsForJackpot();
    error ServerSeedHashAlreadyUsed();  // FIX #5: New error for seed reuse
    error ArithmeticOverflow();  // Overflow protection for solvency checks

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
        
        // FIX #4: VRF coordinator is REQUIRED in V5
        if (_vrfCoordinator == address(0)) {
            revert VRFNotConfigured();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        
        // FIX #6: Grant VRF_ROLE only to exact coordinator address
        vrfCoordinator = IVRFCoordinator(_vrfCoordinator);
        _grantRole(VRF_ROLE, _vrfCoordinator);

        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        daoTreasury = _daoTreasury;
        
        // FIX #1: Compute domain separator with chainId and contract address
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("StarForge")),
            keccak256(bytes(VERSION)),
            block.chainid,
            address(this)
        ));
        
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
     * @notice Commit to a new game with provably fair VRF
     * @param _tier Game tier (Bronze/Silver/Gold)
     * @param serverSeedHash Server seed hash - MUST be keccak256(COMMIT_DOMAIN, serverSeed)
     * @param starTokenId Optional Star Skrumpey token ID for bonus (0 if not claiming)
     * @param expiration Signature expiration timestamp
     * @param signature Operator signature authorizing this specific game commit
     * @return gameId Unique game identifier
     * 
     * @dev SECURITY FIXES:
     * - FIX #1: Signature includes chainId + address(this) via DOMAIN_SEPARATOR
     * - FIX #4: VRF is always requested (no non-VRF fallback)
     * - FIX #5: serverSeedHash must be unique (prevents replay)
     * 
     * Signature message structure:
     * keccak256(DOMAIN_SEPARATOR, player, tier, serverSeedHash, expiration, nonce)
     */
    function commitGame(
        Tier _tier,
        bytes32 serverSeedHash,
        uint256 starTokenId,
        uint256 expiration,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused returns (bytes32 gameId) {
        // 1. Verify Tier & Payment first
        TierConfig storage tierConfig = tiers[_tier];
        
        if (!tierConfig.isActive) revert TierNotActive();
        if (tierConfig.isPaused) revert TierPaused();
        if (msg.value != tierConfig.entryFee) revert InvalidEntryFee();
        
        // 2. FIX #3: Rate limit check with correct wrap-around
        if (!_checkRateLimit(msg.sender)) revert RateLimitExceeded();
        
        // 3. Verify Signature with expiration
        if (block.timestamp > expiration) revert SignatureExpired();
        
        // Additional check: signature shouldn't be valid for too long
        if (expiration > block.timestamp + SIGNATURE_VALIDITY) revert SignatureValidityTooLong();
        
        uint256 currentNonce = playerNonces[msg.sender];
        
        {
            // FIX #1: Include DOMAIN_SEPARATOR for cross-chain/contract replay protection
            bytes32 structHash = keccak256(abi.encode(
                keccak256("CommitGame(address player,uint8 tier,bytes32 serverSeedHash,uint256 expiration,uint256 nonce)"),
                msg.sender,
                uint8(_tier),
                serverSeedHash,
                expiration,
                currentNonce
            ));
            
            bytes32 digest = keccak256(abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                structHash
            ));
            
            address signer = ECDSA.recover(digest, signature);
            
            if (signer == address(0) || !hasRole(OPERATOR_ROLE, signer)) {
                revert InvalidSignature();
            }
        }
        
        // 4. FIX #5: Check serverSeedHash hasn't been used before
        if (usedServerSeedHashes[serverSeedHash]) {
            revert ServerSeedHashAlreadyUsed();
        }
        usedServerSeedHashes[serverSeedHash] = true;
        
        // 5. Check Star Holder status
        bool _isStarHolder = false;
        if (starTokenId > 0) {
            _isStarHolder = _checkStarHolderWithToken(msg.sender, starTokenId);
        }
        
        // 6. Increment nonce AFTER using it for signature verification
        playerNonces[msg.sender]++;
        
        // 7. Generate Game ID (includes all unique factors)
        gameId = keccak256(abi.encodePacked(
            DOMAIN_SEPARATOR,  // FIX #1: Chain-specific
            msg.sender, 
            _tier, 
            currentNonce, 
            block.timestamp, 
            serverSeedHash
        ));
        
        // 8. Update stats
        totalWagered += msg.value;
        totalPendingEntryFees += msg.value;

        // 9. Store commitment
        GameCommitment storage c = commitments[gameId];
        c.player = msg.sender;
        c.tier = _tier;
        c.entryFee = msg.value;
        c.serverSeedHash = serverSeedHash;
        c.nonce = currentNonce;
        c.timestamp = block.timestamp;
        c.isStarHolder = _isStarHolder;
        c.starTokenId = starTokenId;

        emit GameCommitted(gameId, msg.sender, _tier, msg.value, serverSeedHash, currentNonce, _isStarHolder);
        
        // 10. FIX #4: VRF is ALWAYS requested - no non-VRF fallback
        _requestVRF(gameId);
    }
    
    /**
     * @notice Reveal game result and process payout
     * @param gameId Game identifier
     * @param serverSeed Server seed (must match hash: keccak256(COMMIT_DOMAIN, serverSeed))
     * 
     * @dev SECURITY: 
     * - VRF is REQUIRED - game cannot be revealed without VRF fulfillment
     * - Multiplier is calculated on-chain from VRF grid (provably fair)
     * - No server-side outcome manipulation possible
     */
    function revealGame(
        bytes32 gameId,
        bytes32 serverSeed
    ) external nonReentrant whenNotPaused {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.revealed) revert GameAlreadyRevealed();
        
        // Validate server seed with domain separator
        if (keccak256(abi.encodePacked(COMMIT_DOMAIN, serverSeed)) != commitment.serverSeedHash) {
            revert InvalidServerSeed();
        }
        
        // FIX #4: VRF is REQUIRED - no non-VRF path
        if (commitment.vrfRequestId == 0) revert VRFNotConfigured();
        if (!commitment.vrfFulfilled) revert VRFNotFulfilled();
        
        // Generate grid from VRF randomness + server seed
        uint256 grid = _generateGridFromVRF(vrfRandomness[gameId], serverSeed);
        
        // Calculate multiplier dynamically from grid pattern (PROVABLY FAIR)
        uint256 multiplier = _calculateMultiplierFromGrid(grid);
        uint8 patternId = _getPatternId(grid);
        
        // Mark revealed and decrement pending liabilities
        commitment.revealed = true;
        totalPendingEntryFees -= commitment.entryFee;
        totalGamesPlayed++;

        bool isJackpot = (multiplier == type(uint256).max);
        if (!isJackpot && multiplier > MAX_MULTIPLIER * MULTIPLIER_DIVISOR) revert InvalidPayout();

        TierConfig storage tierConfig = tiers[commitment.tier];
        uint256 payout = 0;

        // --- Fee Logic ---
        uint256 treasuryAmount;
        uint256 jackpotAlloc = (commitment.entryFee * JACKPOT_POOL_BPS) / BPS_DIVISOR;
        uint256 netStake;
        
        // Star holders: 91% to prize pool (88% + 3% bonus fund), 4% treasury
        // Standard: 88% to prize pool, 7% treasury
        if (commitment.isStarHolder) {
            treasuryAmount = (commitment.entryFee * TREASURY_STAR_BPS) / BPS_DIVISOR;
            netStake = (commitment.entryFee * (PRIZE_POOL_BPS + STAR_BONUS_BPS)) / BPS_DIVISOR;
        } else {
            treasuryAmount = (commitment.entryFee * TREASURY_STANDARD_BPS) / BPS_DIVISOR;
            netStake = (commitment.entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        }
        
        tierConfig.prizePool += netStake;
        tierConfig.jackpotPool += jackpotAlloc;

        // Distribute Treasury (Soft fail to prevent DoS)
        if (treasuryAmount > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasuryAmount}("");
            if (!success) {
                accumulatedTreasuryFees += treasuryAmount;
                emit TreasuryTransferFailed(treasuryAmount);
            }
        }

        if (isJackpot) {
            // Verify Grid is full (all 25 stars lit)
            if (grid != ((1 << 25) - 1)) revert InvalidJackpotGrid();
            
            // Jackpot REQUIRES VRF validation (already checked above)
            if (tierConfig.jackpotPool == 0) revert InsufficientFundsForJackpot();
            
            payout = tierConfig.jackpotPool;
            tierConfig.jackpotPool = 0;
            emit JackpotWon(gameId, commitment.player, commitment.tier, payout);
        } else if (multiplier > 0) {
            payout = _calculatePayout(commitment.entryFee, multiplier, commitment.isStarHolder);
            
            if (payout > tierConfig.maxPayout) payout = tierConfig.maxPayout;
            
            // SOLVENCY CHECK: Revert if insufficient funds
            if (payout > tierConfig.prizePool) revert InsufficientFundsForPayout();
            
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
        
        if (block.timestamp < commitment.timestamp + REFUND_WINDOW) revert RefundWindowNotReached();
        
        _processFullRefund(gameId, commitment);
    }

    /**
     * @notice Force reveal a game after VRF timeout
     * @dev Refunds 100% of entry fee because fees were never distributed
     */
    function forceReveal(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundProcessed[gameId]) revert RefundAlreadyProcessed();
        
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
     * @notice Request emergency withdrawal with timelock
     * @param amount Amount to withdraw
     */
    function requestEmergencyWithdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (withdrawalRequest.pending) revert WithdrawalLocked();
        
        uint256 totalLiabilities = _calculateTotalLiabilities();
        
        // Overflow check: ensure addition doesn't overflow
        if (amount > type(uint256).max - totalLiabilities) revert ArithmeticOverflow();
        
        if (address(this).balance < totalLiabilities + amount) revert InsufficientSurplus();

        withdrawalRequest = WithdrawalRequest({
            amount: amount,
            unlockTimestamp: block.timestamp + WITHDRAWAL_TIMELOCK,
            pending: true
        });

        emit WithdrawalRequested(amount, withdrawalRequest.unlockTimestamp);
    }

    /**
     * @notice Execute timelocked emergency withdrawal
     */
    function executeEmergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (!withdrawalRequest.pending) revert NoWithdrawalPending();
        if (block.timestamp < withdrawalRequest.unlockTimestamp) revert WithdrawalLocked();
        
        uint256 amount = withdrawalRequest.amount;
        withdrawalRequest.pending = false;
        withdrawalRequest.amount = 0;

        // Double check solvency at execution time
        uint256 totalLiabilities = _calculateTotalLiabilities();
        
        // Overflow check: ensure addition doesn't overflow
        if (amount > type(uint256).max - totalLiabilities) revert ArithmeticOverflow();
        
        if (address(this).balance < totalLiabilities + amount) revert InsufficientSurplus();

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit WithdrawalExecuted(msg.sender, amount);
    }

    /**
     * @notice Cancel pending withdrawal request
     */
    function cancelWithdrawalRequest() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!withdrawalRequest.pending) revert NoWithdrawalPending();
        withdrawalRequest.pending = false;
        withdrawalRequest.amount = 0;
    }

    /**
     * @notice Set DAO treasury address
     * @param newTreasury New treasury address
     */
    function setDaoTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = daoTreasury;
        daoTreasury = newTreasury;
        emit DaoTreasuryUpdated(newTreasury);
    }

    /**
     * @notice Set VRF coordinator with proper role management
     * @param _coordinator New VRF coordinator address
     * @dev FIX #6: Properly manages VRF_ROLE on coordinator change
     */
    function setVRFCoordinator(address _coordinator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_coordinator == address(0)) revert ZeroAddress();
        
        address oldCoordinator = address(vrfCoordinator);
        
        // Revoke role from old coordinator
        if (oldCoordinator != address(0)) {
            _revokeRole(VRF_ROLE, oldCoordinator);
        }
        
        vrfCoordinator = IVRFCoordinator(_coordinator);
        _grantRole(VRF_ROLE, _coordinator);
        
        emit VRFCoordinatorUpdated(oldCoordinator, _coordinator);
    }

    /**
     * @notice Fund tier treasury/prize pool
     * @param tier Tier to fund
     */
    function fundTreasury(Tier tier) external payable onlyRole(OPERATOR_ROLE) {
        TierConfig storage tierConfig = tiers[tier];
        tierConfig.prizePool += msg.value;
        if (tierConfig.prizePool >= tierConfig.minTreasuryRequired && !tierConfig.isActive) {
            tierConfig.isActive = true;
            emit TierStatusChanged(tier, true, tierConfig.isPaused);
        }
        emit TreasuryFunded(tier, msg.value);
    }

    /**
     * @notice Seed jackpot pool
     * @param tier Tier to seed
     */
    function seedJackpot(Tier tier) external payable onlyRole(OPERATOR_ROLE) {
        tiers[tier].jackpotPool += msg.value;
        emit JackpotSeeded(tier, msg.value);
    }

    /**
     * @notice Update tier configuration
     * @param tier Tier to update
     * @param entryFee New entry fee
     * @param maxPayout New max payout
     * @param minTreasury New minimum treasury
     */
    function updateTier(Tier tier, uint256 entryFee, uint256 maxPayout, uint256 minTreasury) external onlyRole(OPERATOR_ROLE) {
        TierConfig storage tc = tiers[tier];
        tc.entryFee = entryFee;
        tc.maxPayout = maxPayout;
        tc.minTreasuryRequired = minTreasury;
        emit TierUpdated(tier, entryFee, maxPayout, minTreasury);
    }

    /**
     * @notice Set tier active/pause status
     * @param tier Tier to update
     * @param isActive Whether tier is active
     * @param isPaused Whether tier is paused
     */
    function setTierStatus(Tier tier, bool isActive, bool isPaused) external onlyRole(OPERATOR_ROLE) {
        tiers[tier].isActive = isActive;
        tiers[tier].isPaused = isPaused;
        emit TierStatusChanged(tier, isActive, isPaused);
    }

    /**
     * @notice Register Star Skrumpey token IDs
     * @param tokenIds Array of token IDs
     * @param isStarIds Whether these IDs have Star trait
     */
    function registerStarSkrumpeys(uint256[] calldata tokenIds, bool isStarIds) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            isStarSkrumpey[tokenIds[i]] = isStarIds;
        }
    }

    /**
     * @notice Withdraw accumulated treasury fees from failed transfers
     */
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
     */
    function getSolvencyStatus() external view returns (
        uint256 totalAssets,
        uint256 totalLiabilities, 
        int256 surplus
    ) {
        totalAssets = address(this).balance;
        totalLiabilities = _calculateTotalLiabilities();
        surplus = int256(totalAssets) - int256(totalLiabilities);
    }

    function pause() external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }

    // ============ VRF Logic ============

    /**
     * @notice Request VRF randomness for a game
     * @param gameId Game identifier
     */
    function _requestVRF(bytes32 gameId) internal {
        if (address(vrfCoordinator) == address(0)) revert VRFNotConfigured();
        
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
     * 
     * @dev SECURITY FIXES:
     * - FIX #2: Prevents overwriting already fulfilled VRF data
     * - FIX #6: Only exact VRF coordinator address can call (via VRF_ROLE)
     */
    function fulfillVRFRandomness(uint256 requestId, uint256 randomness) external onlyRole(VRF_ROLE) {
        bytes32 gameId = vrfRequestToGame[requestId];
        if (gameId == bytes32(0)) revert GameNotFound();
        
        GameCommitment storage commitment = commitments[gameId];
        
        // FIX #2: Prevent overwriting already fulfilled VRF
        if (commitment.vrfFulfilled) revert VRFAlreadyFulfilled();
        
        vrfRandomness[gameId] = randomness;
        commitment.vrfFulfilled = true;
        commitment.vrfFulfillmentTimestamp = block.timestamp;
        
        emit VRFFulfilled(gameId, requestId, randomness);
    }

    // ============ Internal Helpers ============

    /**
     * @notice Process full refund for unrevealed game
     * @param gameId Game identifier
     * @param commitment Game commitment storage reference
     */
    function _processFullRefund(bytes32 gameId, GameCommitment storage commitment) internal {
        refundProcessed[gameId] = true;
        commitment.revealed = true;
        totalPendingEntryFees -= commitment.entryFee;

        (bool success, ) = payable(commitment.player).call{value: commitment.entryFee}("");
        if (!success) revert TransferFailed();
        
        emit RefundIssued(gameId, commitment.player, commitment.entryFee);
    }

    /**
     * @notice FIX #3: Rate limit check with correct wrap-around logic
     * @param player Player address
     * @return Whether player can play (not rate limited)
     * 
     * @dev Uses circular buffer correctly:
     * - Always writes at 'head' position
     * - Advances head after write
     * - Counts all entries within time window
     */
    function _checkRateLimit(address player) internal returns (bool) {
        RateLimit storage r = rateLimits[player];
        uint32 currentTime = uint32(block.timestamp);
        uint32 cutoff = uint32(block.timestamp - RATE_LIMIT_WINDOW);
        
        // Count valid entries within time window (check all 10 slots)
        uint256 validCount = 0;
        for (uint256 i = 0; i < RATE_LIMIT_GAMES; i++) {
            if (r.stamps[i] > cutoff) {
                validCount++;
            }
        }
        
        // Check if limit exceeded
        if (validCount >= RATE_LIMIT_GAMES) return false;
        
        // Write new timestamp at head position (overwrites oldest)
        r.stamps[r.head] = currentTime;
        
        // Advance head (with wrap-around)
        r.head = uint8((uint256(r.head) + 1) % RATE_LIMIT_GAMES);
        
        return true;
    }

    /**
     * @notice Calculate total liabilities
     * @return totalLiabilities Sum of all pending obligations
     */
    function _calculateTotalLiabilities() internal view returns (uint256 totalLiabilities) {
        totalLiabilities = totalPendingEntryFees + accumulatedTreasuryFees;
        
        for (uint256 i = 0; i < 3; i++) {
            Tier tier = Tier(i);
            totalLiabilities += tiers[tier].prizePool + tiers[tier].jackpotPool;
        }
    }

    /**
     * @notice Calculate payout amount
     * @param entryFee Entry fee
     * @param multiplier Multiplier in percent*100 (200 = 2x)
     * @param starHolder Whether player is star holder
     * @return Payout amount
     */
    function _calculatePayout(uint256 entryFee, uint256 multiplier, bool starHolder) internal pure returns (uint256) {
        uint256 prizePoolShare = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 basePayout = (prizePoolShare * multiplier) / MULTIPLIER_DIVISOR;
        
        if (starHolder) {
            uint256 bonus = (entryFee * STAR_BONUS_BPS) / BPS_DIVISOR;
            return basePayout + bonus;
        }
        return basePayout;
    }

    /**
     * @notice Check if player owns specific Star Skrumpey token
     * @param player Player address
     * @param tokenId Token ID to verify
     * @return Whether player holds the specified Star Skrumpey
     */
    function _checkStarHolderWithToken(address player, uint256 tokenId) internal view returns (bool) {
        if (!isStarSkrumpey[tokenId]) revert InvalidStarToken();
        try starSkrumpeyNFT.ownerOf(tokenId) returns (address owner) {
            if (owner != player) revert InvalidStarToken();
            return true;
        } catch {
            revert InvalidStarToken();
        }
    }

    /**
     * @notice Generate grid from VRF randomness and server seed
     * @param randomness VRF random value
     * @param seed Server seed
     * @return 25-bit grid representation
     */
    function _generateGridFromVRF(uint256 randomness, bytes32 seed) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(randomness, seed))) & ((1 << 25) - 1);
    }

    /**
     * @notice Count number of stars (set bits) in grid
     * @param grid 25-bit grid
     * @return count Number of lit stars
     */
    function _countStars(uint256 grid) internal pure returns (uint256 count) {
        // Brian Kernighan's algorithm
        uint256 n = grid;
        while (n != 0) {
            n &= n - 1;
            count++;
        }
    }

    /**
     * @notice Calculate multiplier from grid pattern (PROVABLY FAIR)
     * @param grid 25-bit grid result
     * @return multiplier Payout multiplier in percent*100
     * 
     * Pattern Definitions:
     * - 25 stars: JACKPOT (type(uint256).max)
     * - 20-24: 10x (1000)
     * - 16-19: 5x (500)
     * - 13-15: 3x (300)
     * - 10-12: 2x (200)
     * - 7-9: 1.5x (150)
     * - 5-6: 1.25x (125)
     * - 3-4: 1x (100)
     * - 0-2: 0x (loss)
     */
    function _calculateMultiplierFromGrid(uint256 grid) internal pure returns (uint256) {
        uint256 starCount = _countStars(grid);
        
        if (starCount == 25) return type(uint256).max; // Jackpot
        else if (starCount >= 20) return 1000; // 10x
        else if (starCount >= 16) return 500;  // 5x
        else if (starCount >= 13) return 300;  // 3x
        else if (starCount >= 10) return 200;  // 2x
        else if (starCount >= 7) return 150;   // 1.5x
        else if (starCount >= 5) return 125;   // 1.25x
        else if (starCount >= 3) return 100;   // 1x
        else return 0; // Loss
    }

    /**
     * @notice Get pattern ID from grid for event emission
     * @param grid 25-bit grid result
     * @return patternId Pattern identifier (0-8)
     */
    function _getPatternId(uint256 grid) internal pure returns (uint8) {
        uint256 starCount = _countStars(grid);
        
        if (starCount == 25) return 8; // Jackpot
        else if (starCount >= 20) return 7; // 10x
        else if (starCount >= 16) return 6; // 5x
        else if (starCount >= 13) return 5; // 3x
        else if (starCount >= 10) return 4; // 2x
        else if (starCount >= 7) return 3; // 1.5x
        else if (starCount >= 5) return 2; // 1.25x
        else if (starCount >= 3) return 1; // 1x
        else return 0; // Loss
    }

    // ============ View Functions ============

    /**
     * @notice Get time until force reveal is available
     * @param gameId Game identifier
     * @return Seconds until force reveal (0 if available or not applicable)
     */
    function getTimeUntilForceReveal(bytes32 gameId) external view returns (uint256) {
        GameCommitment memory c = commitments[gameId];
        if (!c.vrfFulfilled) return 0;
        uint256 unlockTime = c.vrfFulfillmentTimestamp + REVEAL_TIMEOUT;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }
    
    /**
     * @notice Get time until refund is available
     * @param gameId Game identifier
     * @return Seconds until refund (0 if available or not applicable)
     */
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
     * @notice Get player's current nonce
     * @param player Player address
     * @return Current nonce value
     */
    function getPlayerNonce(address player) external view returns (uint256) {
        return playerNonces[player];
    }
    
    /**
     * @notice Check if a server seed hash has been used
     * @param serverSeedHash Hash to check
     * @return Whether the hash has been used
     */
    function isServerSeedHashUsed(bytes32 serverSeedHash) external view returns (bool) {
        return usedServerSeedHashes[serverSeedHash];
    }

    /**
     * @notice Receive native token
     */
    receive() external payable {}
}
