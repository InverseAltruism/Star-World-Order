// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IVRFCoordinator {
    function requestRandomness(bytes memory data) external returns (uint256);
}

/**
 * @title StarForge
 * @author Star World Order DAO
 * @notice Provably fair 5x5 constellation grid game on Monad
 * @dev Commit-reveal RNG game with constellation pattern matching and VRF fallback
 */
contract StarForge is ReentrancyGuard, AccessControl, Pausable {
    
    // ============ Roles ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VRF_ROLE = keccak256("VRF_ROLE");

    // ============ Constants ============
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant PRIZE_POOL_BPS = 8800;      // 88%
    uint256 public constant JACKPOT_POOL_BPS = 500;     // 5%
    uint256 public constant TREASURY_STANDARD_BPS = 700;// 7%
    uint256 public constant TREASURY_STAR_BPS = 400;    // 4%
    uint256 public constant STAR_BONUS_BPS = 300;       // 3%
    
    uint256 public constant MAX_MULTIPLIER = 10;
    uint256 public constant RATE_LIMIT_GAMES = 10;
    uint256 public constant RATE_LIMIT_WINDOW = 1 minutes;
    uint256 public constant MAX_RATE_LIMIT_ENTRIES = 20;
    uint256 public constant REFUND_WINDOW = 24 hours;
    uint256 public constant REVEAL_TIMEOUT = 1 hours;
    uint256 public constant WITHDRAWAL_TIMELOCK = 24 hours;

    // ============ State Variables ============
    IERC721 public immutable starSkrumpeyNFT;
    address public daoTreasury;
    IVRFCoordinator public vrfCoordinator;
    bool public vrfEnabled;

    struct TierConfig {
        uint256 entryFee;           
        uint256 maxPayout;          
        uint256 minTreasuryRequired;
        uint256 prizePool;          
        uint256 jackpotPool;        
        bool isActive;   
        bool isPaused; // Allow pausing specific tiers           
    }
    
    enum Tier { BRONZE, SILVER, GOLD }
    mapping(Tier => TierConfig) public tiers;
    
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
    
    mapping(bytes32 => GameCommitment) public commitments;
    mapping(address => uint256) public playerNonces;
    
    struct RateLimit {
        uint64 head;        
        uint64 count;       
        uint64[20] stamps;  
    }
    mapping(address => RateLimit) private rateLimits;
    
    // Stats
    uint256 public totalGamesPlayed;
    uint256 public totalWagered;
    uint256 public totalPaidOut;
    
    // Configuration
    mapping(uint256 => bool) public isStarSkrumpey;
    
    // VRF
    mapping(bytes32 => uint256) public vrfRandomness;
    mapping(uint256 => bytes32) public vrfRequestToGame;
    uint256 private nextVRFRequestId;
    
    // Solvency & Safety
    mapping(bytes32 => bool) public refundProcessed;
    uint256 public totalPendingEntryFees;
    uint256 public accumulatedTreasuryFees;

    // Emergency Withdraw Timelock
    struct WithdrawalRequest {
        uint256 amount;
        uint256 unlockTimestamp;
        bool pending;
    }
    WithdrawalRequest public withdrawalRequest;
    
    // ============ Events ============
    event GameCommitted(bytes32 indexed gameId, address indexed player, Tier tier, uint256 entryFee, bytes32 serverSeedHash, uint256 nonce, bool isStarHolder);
    event GameRevealed(bytes32 indexed gameId, address indexed player, Tier tier, uint256 grid, uint8 patternId, uint256 multiplier, uint256 payout, bool isJackpot);
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
    error RefundWindowExpired();  
    error RefundAlreadyProcessed(); 
    error ZeroAddress();
    error VRFRevealTimeout();  
    error InvalidStarToken();  
    error WithdrawalLocked();
    error NoWithdrawalPending();

    constructor(
        address _starSkrumpeyNFT,
        address _daoTreasury,
        address _vrfCoordinator,
        address _admin
    ) {
        if (_starSkrumpeyNFT == address(0) || _daoTreasury == address(0) || _admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        
        // If VRF coordinator is provided, grant role, otherwise manual setup needed later
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

        // NOTE: We do NOT distribute fees here. Fees are distributed on reveal.
        // This ensures 100% refund capability.

        emit GameCommitted(gameId, msg.sender, _tier, msg.value, serverSeedHash, nonce, _isStarHolder);
        
        // Trigger VRF if enabled
        if (vrfEnabled) {
             _requestVRF(gameId);
        }
    }
    
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
        
        // Validations
        if (keccak256(abi.encodePacked(serverSeed)) != commitment.serverSeedHash) revert InvalidServerSeed();
        
        if (vrfEnabled) {
            if (commitment.vrfRequestId == 0 || !commitment.vrfFulfilled) revert Unauthorized();
            uint256 expectedGrid = _generateGridFromVRF(vrfRandomness[gameId], serverSeed);
            if (grid != expectedGrid) revert InvalidServerSeed();
        }
        
        // Mark revealed and decrement pending
        commitment.revealed = true;
        totalPendingEntryFees -= commitment.entryFee;
        totalGamesPlayed++;

        // --- Fee Distribution & Payout Logic ---
        
        bool isJackpot = (multiplier == type(uint256).max);
        if (!isJackpot && multiplier > MAX_MULTIPLIER * 100) revert InvalidPayout();

        TierConfig storage tierConfig = tiers[commitment.tier];
        uint256 payout = 0;

        // 1. Calculate Deductions (Treasury & Jackpot)
        // These are calculated from the entry fee
        uint256 treasuryAmount;
        uint256 jackpotAlloc = (commitment.entryFee * JACKPOT_POOL_BPS) / BPS_DIVISOR;
        
        if (commitment.isStarHolder) {
            treasuryAmount = (commitment.entryFee * TREASURY_STAR_BPS) / BPS_DIVISOR;
        } else {
            treasuryAmount = (commitment.entryFee * TREASURY_STANDARD_BPS) / BPS_DIVISOR;
        }

        // 2. Add Net Stake to Prize Pool
        // The "Net Stake" is the portion going to the prize pool (approx 88%)
        // We conceptually add the player's stake to the pool before paying them out
        uint256 netStake = commitment.entryFee - treasuryAmount - jackpotAlloc;
        tierConfig.prizePool += netStake;

        // 3. Update Jackpot Pool
        tierConfig.jackpotPool += jackpotAlloc;

        // 4. Distribute Treasury (Soft fail)
        if (treasuryAmount > 0) {
            (bool success, ) = payable(daoTreasury).call{value: treasuryAmount}("");
            if (!success) {
                accumulatedTreasuryFees += treasuryAmount;
                emit TreasuryTransferFailed(treasuryAmount);
            }
        }

        // 5. Calculate Payout
        if (isJackpot) {
            payout = tierConfig.jackpotPool;
            if (payout == 0) revert InsufficientJackpotPool();
            tierConfig.jackpotPool = 0;
            emit JackpotWon(gameId, commitment.player, commitment.tier, payout);
        } else if (multiplier > 0) {
            // Multiplier applies to the PRIZE_POOL portion (88%), plus bonus if applicable
            // _calculatePayout uses pure math based on entry fee sizes
            payout = _calculatePayout(commitment.entryFee, multiplier, commitment.isStarHolder);
            
            if (payout > tierConfig.maxPayout) payout = tierConfig.maxPayout;
            if (payout > tierConfig.prizePool) revert InsufficientTreasuryBalance(); // Should not happen with proper solvent pools
            
            tierConfig.prizePool -= payout;
        }

        // 6. Transfer Payout
        if (payout > 0) {
            totalPaidOut += payout;
            (bool success, ) = payable(commitment.player).call{value: payout}("");
            if (!success) revert TransferFailed();
        }
        
        emit GameRevealed(gameId, commitment.player, commitment.tier, grid, patternId, multiplier, payout, isJackpot);
    }
    
    function requestRefund(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundProcessed[gameId]) revert RefundAlreadyProcessed();
        
        // Standard refund window check
        if (block.timestamp < commitment.timestamp + REFUND_WINDOW) revert RefundWindowExpired();
        
        _processFullRefund(gameId, commitment);
    }

    /**
     * @notice Force reveal a game after VRF timeout. 
     * @dev Pays back 100% of entry fee because fees were never distributed.
     */
    function forceReveal(bytes32 gameId) external nonReentrant {
        GameCommitment storage commitment = commitments[gameId];
        
        if (commitment.player != msg.sender) revert Unauthorized();
        if (commitment.revealed) revert GameAlreadyRevealed();
        if (refundProcessed[gameId]) revert RefundAlreadyProcessed();
        
        // VRF specific checks
        if (!vrfEnabled || !commitment.vrfFulfilled) revert VRFRevealTimeout();
        if (block.timestamp < commitment.vrfFulfillmentTimestamp + REVEAL_TIMEOUT) revert VRFRevealTimeout();
        
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

    function setVRFCoordinator(address _coordinator) external onlyRole(DEFAULT_ADMIN_ROLE) {
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

    function pause() external onlyRole(OPERATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(OPERATOR_ROLE) { _unpause(); }

    // ============ VRF Logic ============

    function _requestVRF(bytes32 gameId) internal {
        if (address(vrfCoordinator) == address(0)) revert Unauthorized();
        uint256 requestId = ++nextVRFRequestId;
        commitments[gameId].vrfRequestId = requestId;
        vrfRequestToGame[requestId] = gameId;
        
        // Call external coordinator
        try vrfCoordinator.requestRandomness(abi.encode(gameId)) returns (uint256) {
             emit VRFRequested(gameId, requestId);
        } catch {
             revert TransferFailed(); // Fail if VRF request fails
        }
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

        // Since we didn't distribute fees on commit, we just return the full amount
        (bool success, ) = payable(msg.sender).call{value: commitment.entryFee}("");
        if (!success) revert TransferFailed();
        
        emit RefundIssued(gameId, msg.sender, commitment.entryFee);
    }

    function _checkRateLimit(address player) internal returns (bool) {
        RateLimit storage r = rateLimits[player];
        uint256 cutoff = block.timestamp - RATE_LIMIT_WINDOW;
        uint256 valid = 0;
        for (uint256 i = 0; i < r.count; i++) {
            uint256 idx = (r.head + i) % MAX_RATE_LIMIT_ENTRIES;
            if (r.stamps[idx] > cutoff) valid++;
        }
        if (valid >= RATE_LIMIT_GAMES) return false;
        
        uint256 nextIdx = (r.head + r.count) % MAX_RATE_LIMIT_ENTRIES;
        if (r.count < MAX_RATE_LIMIT_ENTRIES) {
            r.stamps[nextIdx] = uint64(block.timestamp);
            r.count++;
        } else {
            r.stamps[r.head] = uint64(block.timestamp);
            r.head = (r.head + 1) % MAX_RATE_LIMIT_ENTRIES;
        }
        return true;
    }

    function _calculatePayout(uint256 entryFee, uint256 multiplier, bool starHolder) internal pure returns (uint256) {
        // Base calculation on the Prize Pool allocation (88% of entry)
        uint256 prizePoolShare = (entryFee * PRIZE_POOL_BPS) / BPS_DIVISOR;
        uint256 basePayout = (prizePoolShare * multiplier) / 100;
        
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

    // placeholder logic for grid generation
    function _generateGridFromVRF(uint256 randomness, bytes32 seed) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(randomness, seed))) & ((1 << 25) - 1);
    }

    // ============ View Helpers for Frontend ============
    
    /**
     * @notice Helper to find Star Skrumpeys in a player's wallet.
     * @dev GAS HEAVY: Call off-chain via view/staticCall only.
     */
    function getStarTokens(address player) external view returns (uint256[] memory) {
        uint256 balance = starSkrumpeyNFT.balanceOf(player);
        if (balance == 0) return new uint256[](0);

        // Cap at 20 to prevent timeouts
        uint256 scanCount = balance > 20 ? 20 : balance;
        uint256[] memory tokens = new uint256[](scanCount);
        uint256 found = 0;

        try IERC721Enumerable(address(starSkrumpeyNFT)).tokenOfOwnerByIndex(player, 0) returns (uint256) {
            for (uint256 i = 0; i < scanCount; i++) {
                uint256 tid = IERC721Enumerable(address(starSkrumpeyNFT)).tokenOfOwnerByIndex(player, i);
                if (isStarSkrumpey[tid]) {
                    tokens[found] = tid;
                    found++;
                }
            }
        } catch {
            return new uint256[](0);
        }

        // Resize array
        uint256[] memory result = new uint256[](found);
        for(uint256 i=0; i<found; i++) result[i] = tokens[i];
        return result;
    }

    function getTimeUntilForceReveal(bytes32 gameId) external view returns (uint256) {
        GameCommitment memory c = commitments[gameId];
        if (!c.vrfFulfilled) return 0;
        uint256 unlockTime = c.vrfFulfillmentTimestamp + REVEAL_TIMEOUT;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }
}
