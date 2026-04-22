// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title IVRFCoordinator
 * @notice Interface for VRF Coordinator. 
 * @dev Ensure your specific provider (Chainlink/Gelato/etc) supports this interface
 *      and that the subscription/balance is managed off-chain or via prepaid accounts.
 */
interface IVRFCoordinator {
    function requestRandomness(bytes memory data) external returns (uint256);
}

/**
 * @title StarForgeV3
 * @author Star World Order DAO
 * @notice Production-ready provably fair 5x5 constellation grid game on Monad
 * @dev Commit-reveal RNG game with VRF integration and comprehensive security fixes
 */
contract StarForgeV3 is ReentrancyGuard, AccessControl, Pausable {
    using ECDSA for bytes32;

    // ============ Roles ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VRF_ROLE = keccak256("VRF_ROLE");

    // ============ Constants ============
    
    /// @notice Domain separator for commit hash validation
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
    
    /// @notice Compact rate limiting storage
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
    error VRFNotConfigured();
    error VRFNotFulfilled();
    error VRFRevealTimeoutNotReached();
    error VRFRequestFailed();
    error InvalidJackpotGrid();
    error JackpotRequiresVRF();
    error InvalidPattern();
    error SignatureExpired();
    error InvalidSignature();
    error InsufficientFundsForPayout();
    error InsufficientFundsForJackpot();

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
     * @param serverSeedHash Server seed hash authorized by Operator
     * @param starTokenId Optional Star Skrumpey token ID for bonus (0 if not claiming)
     * @param expiration Signature expiration timestamp
     * @param signature Operator signature authorizing this specific game commit
     * @return gameId Unique game identifier
     * @dev SECURITY: Signature verification prevents "Risk-Free Betting" exploit
     * @dev Signature must cover: (player, tier, seedHash, expiration, NONCE)
     */
    function commitGame(
        Tier _tier,
        bytes32 serverSeedHash,
        uint256 starTokenId,
        uint256 expiration,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused returns (bytes32 gameId) {
        // 1. Verify Tier & Payment first to save gas
        TierConfig storage tierConfig = tiers[_tier];
        
        if (!tierConfig.isActive) revert TierNotActive();
        if (tierConfig.isPaused) revert TierPaused();
        if (msg.value != tierConfig.entryFee) revert InvalidEntryFee();
        if (!_checkRateLimit(msg.sender)) revert RateLimitExceeded();
        
        // 2. Verify Signature
        if (block.timestamp > expiration) revert SignatureExpired();
        
        uint256 currentNonce = playerNonces[msg.sender];
        
        {
            // Reconstruct the message hash. IMPORTANT: Includes NONCE to prevent replay.
            // Message: Sender + Tier + SeedHash + Expiration + Nonce
            bytes32 messageHash = keccak256(abi.encode(msg.sender, _tier, serverSeedHash, expiration, currentNonce));
            address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(messageHash), signature);
            
            if (signer == address(0) || !hasRole(OPERATOR_ROLE, signer)) {
                revert InvalidSignature();
            }
        }
        
        // 3. Logic
        bool _isStarHolder = false;
        if (starTokenId > 0) {
            _isStarHolder = _checkStarHolderWithToken(msg.sender, starTokenId);
        }
        
        // Increment nonce AFTER using it for signature verification
        playerNonces[msg.sender]++;
        
        // Generate Game ID
        gameId = keccak256(abi.encodePacked(msg.sender, _tier, currentNonce, block.timestamp, serverSeedHash));
        
        // Update stats
        totalWagered += msg.value;
        totalPendingEntryFees += msg.value;

        // Store commitment
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
        
        // Trigger VRF if enabled
        if (vrfEnabled) {
             _requestVRF(gameId);
        }
    }
    
    /**
     * @notice Reveal game result and process payout
     * @param gameId Game identifier
     * @param serverSeed Server seed (must match hash)
     */
    function revealGame(
        bytes32 gameId,
        bytes32 serverSeed
    ) external nonReentrant whenNotPaused {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player == address(0)) revert GameNotFound();
        if (commitment.revealed) revert GameAlreadyRevealed();
        
        // Validate server seed
        if (keccak256(abi.encodePacked(COMMIT_DOMAIN, serverSeed)) != commitment.serverSeedHash) {
            revert InvalidServerSeed();
        }
        
        // Grid Generation
        uint256 grid;
        if (commitment.vrfRequestId != 0) {
            if (!commitment.vrfFulfilled) revert VRFNotFulfilled();
            grid = _generateGridFromVRF(vrfRandomness[gameId], serverSeed);
        } else {
            // No VRF (Testing only)
            grid = uint256(keccak256(abi.encodePacked(serverSeed))) & ((1 << 25) - 1);
        }
        
        // Calculate Outcomes
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
        
        if (commitment.isStarHolder) {
            treasuryAmount = (commitment.entryFee * TREASURY_STAR_BPS) / BPS_DIVISOR; // 4%
            netStake = (commitment.entryFee * (PRIZE_POOL_BPS + STAR_BONUS_BPS)) / BPS_DIVISOR; // 91%
        } else {
            treasuryAmount = (commitment.entryFee * TREASURY_STANDARD_BPS) / BPS_DIVISOR; // 7%
            netStake = (commitment.entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR; // 88%
        }
        
        // --- Solvency Checks & Updates ---
        // CRITICAL: We update state tentatively, but will revert if pools are insufficient
        
        tierConfig.prizePool += netStake;
        tierConfig.jackpotPool += jackpotAlloc;

        if (treasuryAmount > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasuryAmount}("");
            if (!success) {
                accumulatedTreasuryFees += treasuryAmount;
                emit TreasuryTransferFailed(treasuryAmount);
            }
        }

        if (isJackpot) {
            // Verify Grid
            if (grid != ((1 << 25) - 1)) revert InvalidJackpotGrid();
            if (commitment.vrfRequestId == 0) revert JackpotRequiresVRF();
            
            // STRICT SOLVENCY CHECK
            if (tierConfig.jackpotPool == 0) revert InsufficientFundsForJackpot();
            
            payout = tierConfig.jackpotPool;
            tierConfig.jackpotPool = 0;
            emit JackpotWon(gameId, commitment.player, commitment.tier, payout);
        } else if (multiplier > 0) {
            payout = _calculatePayout(commitment.entryFee, multiplier, commitment.isStarHolder);
            
            if (payout > tierConfig.maxPayout) payout = tierConfig.maxPayout;
            
            // STRICT SOLVENCY CHECK
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

    function requestEmergencyWithdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (withdrawalRequest.pending) revert WithdrawalLocked();
        
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

    function setDaoTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        daoTreasury = newTreasury;
        emit DaoTreasuryUpdated(newTreasury);
    }

    function setVRFCoordinator(address _coordinator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_coordinator == address(0)) revert ZeroAddress();
        
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

        (bool success, ) = payable(msg.sender).call{value: commitment.entryFee}("");
        if (!success) revert TransferFailed();
        
        emit RefundIssued(gameId, msg.sender, commitment.entryFee);
    }

    function _checkRateLimit(address player) internal returns (bool) {
        RateLimit storage r = rateLimits[player];
        uint32 currentTime = uint32(block.timestamp);
        uint32 cutoff = uint32(block.timestamp - RATE_LIMIT_WINDOW);
        
        uint256 valid = 0;
        for (uint256 i = 0; i < r.count; i++) {
            if (r.stamps[i] > cutoff) valid++;
        }
        
        if (valid >= RATE_LIMIT_GAMES) return false;
        
        r.stamps[r.head] = currentTime;
        r.head = uint8((r.head + 1) % RATE_LIMIT_GAMES);
        if (r.count < RATE_LIMIT_GAMES) {
            r.count++;
        }
        
        return true;
    }

    function _calculatePayout(uint256 entryFee, uint256 multiplier, bool starHolder) internal pure returns (uint256) {
        uint256 prizePoolShare = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 basePayout = (prizePoolShare * multiplier) / MULTIPLIER_DIVISOR;
        
        if (starHolder) {
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

    function _countStars(uint256 grid) internal pure returns (uint256 count) {
        uint256 n = grid;
        while (n != 0) {
            n &= n - 1; 
            count++;
        }
    }

    function _calculateMultiplierFromGrid(uint256 grid) internal pure returns (uint256) {
        uint256 starCount = _countStars(grid);
        
        if (starCount == 25) return type(uint256).max;
        else if (starCount >= 20) return 1000;
        else if (starCount >= 16) return 500;
        else if (starCount >= 13) return 300;
        else if (starCount >= 10) return 200;
        else if (starCount >= 7) return 150;
        else if (starCount >= 5) return 125;
        else if (starCount >= 3) return 100;
        else return 0;
    }

    function _getPatternId(uint256 grid) internal pure returns (uint8) {
        uint256 starCount = _countStars(grid);
        
        if (starCount == 25) return 8;
        else if (starCount >= 20) return 7;
        else if (starCount >= 16) return 6;
        else if (starCount >= 13) return 5;
        else if (starCount >= 10) return 4;
        else if (starCount >= 7) return 3;
        else if (starCount >= 5) return 2;
        else if (starCount >= 3) return 1;
        else return 0;
    }

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

    function getTierConfig(Tier tier) external view returns (TierConfig memory) {
        return tiers[tier];
    }
    
    function getCommitment(bytes32 gameId) external view returns (GameCommitment memory) {
        return commitments[gameId];
    }

    receive() external payable {}
}
