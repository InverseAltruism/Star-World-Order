// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title StarSkrumpeyStaking
 * @author Star World Order DAO
 * @notice Staking contract for Star Skrumpeys on Monad
 * @dev NFT staking with governance power boost and rewards
 * 
 * Key Features:
 * - Stake Star Skrumpeys to earn rewards
 * - Staked NFTs count toward governance voting power
 * - Configurable reward rates and unstaking cooldown
 * - Emergency unstake option with penalty
 * 
 * Rewards Distribution:
 * - Rewards are distributed per second based on stake duration
 * - Longer staking = higher multiplier
 * - Rewards are claimable at any time
 * 
 * Deployed on Monad (Chain ID: 143)
 */
contract StarSkrumpeyStaking is IERC721Receiver, ReentrancyGuard, Ownable, Pausable {
    
    // ============ Constants ============
    
    /// @notice Minimum staking duration (1 day in seconds)
    uint256 public constant MIN_STAKE_DURATION = 1 days;
    
    /// @notice Maximum bonus multiplier (2x = 200%)
    uint256 public constant MAX_MULTIPLIER = 200;
    
    /// @notice Base multiplier (1x = 100%)
    uint256 public constant BASE_MULTIPLIER = 100;
    
    /// @notice Penalty for emergency unstake (10%)
    uint256 public constant EMERGENCY_UNSTAKE_PENALTY = 10;
    
    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice DAO Treasury address for fees
    address public daoTreasury;
    
    /// @notice Base reward rate per second (in wei)
    uint256 public rewardRatePerSecond;
    
    /// @notice Cooldown period for unstaking (in seconds)
    uint256 public unstakeCooldown;
    
    /// @notice Mapping of token ID to stake info
    mapping(uint256 => StakeInfo) public stakes;
    
    /// @notice Mapping of user address to array of staked token IDs
    mapping(address => uint256[]) public userStakedTokens;
    
    /// @notice Mapping of user address to total rewards claimed
    mapping(address => uint256) public totalRewardsClaimed;
    
    /// @notice Mapping of user address to pending rewards
    mapping(address => uint256) public pendingRewards;
    
    /// @notice Total staked NFTs count
    uint256 public totalStaked;
    
    /// @notice Total rewards distributed
    uint256 public totalRewardsDistributed;
    
    // ============ Structs ============
    
    /// @notice Stake information
    struct StakeInfo {
        address owner;           // Original owner
        uint256 tokenId;         // Staked token ID
        uint256 stakedAt;        // Timestamp when staked
        uint256 lastClaimAt;     // Last reward claim timestamp
        uint256 unstakeRequestAt; // Timestamp of unstake request (0 if not requested)
        bool isStaked;           // Whether token is currently staked
    }
    
    // ============ Events ============
    
    /// @notice Emitted when a Star Skrumpey is staked
    event Staked(
        address indexed user,
        uint256 indexed tokenId,
        uint256 timestamp
    );
    
    /// @notice Emitted when an unstake is requested
    event UnstakeRequested(
        address indexed user,
        uint256 indexed tokenId,
        uint256 availableAt
    );
    
    /// @notice Emitted when a Star Skrumpey is unstaked
    event Unstaked(
        address indexed user,
        uint256 indexed tokenId,
        uint256 rewards
    );
    
    /// @notice Emitted when emergency unstake is used
    event EmergencyUnstaked(
        address indexed user,
        uint256 indexed tokenId,
        uint256 penaltyPaid
    );
    
    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(
        address indexed user,
        uint256 amount
    );
    
    /// @notice Emitted when reward rate is updated
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    
    /// @notice Emitted when cooldown period is updated
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    
    // ============ Errors ============
    
    /// @notice Thrown when caller doesn't own the token
    error NotTokenOwner();
    
    /// @notice Thrown when token is not staked
    error TokenNotStaked();
    
    /// @notice Thrown when token is already staked
    error TokenAlreadyStaked();
    
    /// @notice Thrown when unstake is on cooldown
    error UnstakeCooldownActive();
    
    /// @notice Thrown when unstake not requested
    error UnstakeNotRequested();
    
    /// @notice Thrown when no rewards to claim
    error NoRewardsToClaim();
    
    /// @notice Thrown when address is zero
    error ZeroAddress();
    
    /// @notice Thrown when transfer fails
    error TransferFailed();
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the staking contract
     * @param _starSkrumpeyNFT Address of Star Skrumpey NFT contract
     * @param _daoTreasury Address of DAO treasury
     * @param _rewardRatePerSecond Initial reward rate per second
     * @param _unstakeCooldown Initial cooldown period in seconds
     */
    constructor(
        address _starSkrumpeyNFT,
        address _daoTreasury,
        uint256 _rewardRatePerSecond,
        uint256 _unstakeCooldown
    ) Ownable(msg.sender) {
        if (_starSkrumpeyNFT == address(0) || _daoTreasury == address(0)) {
            revert ZeroAddress();
        }
        
        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        daoTreasury = _daoTreasury;
        rewardRatePerSecond = _rewardRatePerSecond;
        unstakeCooldown = _unstakeCooldown;
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Stake a Star Skrumpey
     * @param tokenId The token ID to stake
     */
    function stake(uint256 tokenId) external whenNotPaused nonReentrant {
        // Verify ownership
        if (starSkrumpeyNFT.ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner();
        }
        
        // Check not already staked
        if (stakes[tokenId].isStaked) {
            revert TokenAlreadyStaked();
        }
        
        // Transfer NFT to this contract
        starSkrumpeyNFT.safeTransferFrom(msg.sender, address(this), tokenId);
        
        // Create stake record
        stakes[tokenId] = StakeInfo({
            owner: msg.sender,
            tokenId: tokenId,
            stakedAt: block.timestamp,
            lastClaimAt: block.timestamp,
            unstakeRequestAt: 0,
            isStaked: true
        });
        
        // Add to user's staked tokens
        userStakedTokens[msg.sender].push(tokenId);
        
        // Update total staked
        totalStaked++;
        
        emit Staked(msg.sender, tokenId, block.timestamp);
    }
    
    /**
     * @notice Stake multiple Star Skrumpeys at once
     * @param tokenIds Array of token IDs to stake
     */
    function stakeMultiple(uint256[] calldata tokenIds) external whenNotPaused nonReentrant {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            
            // Verify ownership
            if (starSkrumpeyNFT.ownerOf(tokenId) != msg.sender) {
                revert NotTokenOwner();
            }
            
            // Check not already staked
            if (stakes[tokenId].isStaked) {
                revert TokenAlreadyStaked();
            }
            
            // Transfer NFT to this contract
            starSkrumpeyNFT.safeTransferFrom(msg.sender, address(this), tokenId);
            
            // Create stake record
            stakes[tokenId] = StakeInfo({
                owner: msg.sender,
                tokenId: tokenId,
                stakedAt: block.timestamp,
                lastClaimAt: block.timestamp,
                unstakeRequestAt: 0,
                isStaked: true
            });
            
            // Add to user's staked tokens
            userStakedTokens[msg.sender].push(tokenId);
            
            // Update total staked
            totalStaked++;
            
            emit Staked(msg.sender, tokenId, block.timestamp);
        }
    }
    
    /**
     * @notice Request to unstake a token (starts cooldown)
     * @param tokenId The token ID to unstake
     */
    function requestUnstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[tokenId];
        
        // Validate stake
        if (!stakeInfo.isStaked) revert TokenNotStaked();
        if (stakeInfo.owner != msg.sender) revert NotTokenOwner();
        
        // Set unstake request time
        stakeInfo.unstakeRequestAt = block.timestamp;
        
        uint256 availableAt = block.timestamp + unstakeCooldown;
        emit UnstakeRequested(msg.sender, tokenId, availableAt);
    }
    
    /**
     * @notice Complete unstaking after cooldown
     * @param tokenId The token ID to unstake
     */
    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[tokenId];
        
        // Validate stake
        if (!stakeInfo.isStaked) revert TokenNotStaked();
        if (stakeInfo.owner != msg.sender) revert NotTokenOwner();
        
        // Check cooldown
        if (stakeInfo.unstakeRequestAt == 0) revert UnstakeNotRequested();
        if (block.timestamp < stakeInfo.unstakeRequestAt + unstakeCooldown) {
            revert UnstakeCooldownActive();
        }
        
        // Calculate and store pending rewards before clearing stake
        uint256 rewards = _calculateRewards(tokenId);
        pendingRewards[msg.sender] += rewards;
        
        // Remove from user's staked tokens
        _removeFromUserStakedTokens(msg.sender, tokenId);
        
        // Clear stake info
        delete stakes[tokenId];
        
        // Update total staked
        totalStaked--;
        
        // Return NFT to owner
        starSkrumpeyNFT.safeTransferFrom(address(this), msg.sender, tokenId);
        
        emit Unstaked(msg.sender, tokenId, rewards);
    }
    
    /**
     * @notice Emergency unstake (immediate, but with penalty)
     * @param tokenId The token ID to unstake
     */
    function emergencyUnstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[tokenId];
        
        // Validate stake
        if (!stakeInfo.isStaked) revert TokenNotStaked();
        if (stakeInfo.owner != msg.sender) revert NotTokenOwner();
        
        // Calculate rewards (reduced by penalty)
        uint256 rewards = _calculateRewards(tokenId);
        uint256 penalty = (rewards * EMERGENCY_UNSTAKE_PENALTY) / 100;
        uint256 netRewards = rewards - penalty;
        
        pendingRewards[msg.sender] += netRewards;
        
        // Remove from user's staked tokens
        _removeFromUserStakedTokens(msg.sender, tokenId);
        
        // Clear stake info
        delete stakes[tokenId];
        
        // Update total staked
        totalStaked--;
        
        // Return NFT to owner
        starSkrumpeyNFT.safeTransferFrom(address(this), msg.sender, tokenId);
        
        emit EmergencyUnstaked(msg.sender, tokenId, penalty);
    }
    
    /**
     * @notice Claim all pending rewards
     */
    function claimRewards() external nonReentrant {
        // Calculate rewards from all staked tokens
        uint256 totalRewards = pendingRewards[msg.sender];
        uint256[] storage userTokens = userStakedTokens[msg.sender];
        
        for (uint256 i = 0; i < userTokens.length; i++) {
            uint256 tokenId = userTokens[i];
            if (stakes[tokenId].isStaked) {
                totalRewards += _calculateRewards(tokenId);
                stakes[tokenId].lastClaimAt = block.timestamp;
            }
        }
        
        if (totalRewards == 0) revert NoRewardsToClaim();
        
        // Clear pending rewards
        pendingRewards[msg.sender] = 0;
        
        // Update tracking
        totalRewardsClaimed[msg.sender] += totalRewards;
        totalRewardsDistributed += totalRewards;
        
        emit RewardsClaimed(msg.sender, totalRewards);
        
        // Note: In production, this would transfer actual reward tokens
        // For now, we just emit the event and track the amount
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get all staked tokens for a user
     * @param user The user address
     * @return Array of staked token IDs
     */
    function getStakedTokens(address user) external view returns (uint256[] memory) {
        return userStakedTokens[user];
    }
    
    /**
     * @notice Get staking info for a token
     * @param tokenId The token ID
     * @return The stake info
     */
    function getStakeInfo(uint256 tokenId) external view returns (StakeInfo memory) {
        return stakes[tokenId];
    }
    
    /**
     * @notice Calculate pending rewards for a token
     * @param tokenId The token ID
     * @return The pending rewards
     */
    function calculatePendingRewards(uint256 tokenId) external view returns (uint256) {
        return _calculateRewards(tokenId);
    }
    
    /**
     * @notice Calculate total pending rewards for a user
     * @param user The user address
     * @return Total pending rewards
     */
    function calculateTotalPendingRewards(address user) external view returns (uint256) {
        uint256 total = pendingRewards[user];
        uint256[] storage userTokens = userStakedTokens[user];
        
        for (uint256 i = 0; i < userTokens.length; i++) {
            if (stakes[userTokens[i]].isStaked) {
                total += _calculateRewards(userTokens[i]);
            }
        }
        
        return total;
    }
    
    /**
     * @notice Get staking multiplier based on duration
     * @param tokenId The token ID
     * @return The multiplier (100 = 1x, 200 = 2x)
     */
    function getStakingMultiplier(uint256 tokenId) external view returns (uint256) {
        return _getMultiplier(tokenId);
    }
    
    /**
     * @notice Get number of staked tokens for a user
     * @param user The user address
     * @return The count of staked tokens
     */
    function getStakedCount(address user) external view returns (uint256) {
        return userStakedTokens[user].length;
    }
    
    /**
     * @notice Check if unstake is available for a token
     * @param tokenId The token ID
     * @return Whether unstake is available
     */
    function canUnstake(uint256 tokenId) external view returns (bool) {
        StakeInfo storage stakeInfo = stakes[tokenId];
        if (!stakeInfo.isStaked) return false;
        if (stakeInfo.unstakeRequestAt == 0) return false;
        return block.timestamp >= stakeInfo.unstakeRequestAt + unstakeCooldown;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Calculate rewards for a staked token
     * @param tokenId The token ID
     * @return The calculated rewards
     */
    function _calculateRewards(uint256 tokenId) internal view returns (uint256) {
        StakeInfo storage stakeInfo = stakes[tokenId];
        if (!stakeInfo.isStaked) return 0;
        
        uint256 stakeDuration = block.timestamp - stakeInfo.lastClaimAt;
        uint256 multiplier = _getMultiplier(tokenId);
        
        return (stakeDuration * rewardRatePerSecond * multiplier) / BASE_MULTIPLIER;
    }
    
    /**
     * @notice Get reward multiplier based on staking duration
     * @param tokenId The token ID
     * @return The multiplier (100-200)
     */
    function _getMultiplier(uint256 tokenId) internal view returns (uint256) {
        StakeInfo storage stakeInfo = stakes[tokenId];
        if (!stakeInfo.isStaked) return BASE_MULTIPLIER;
        
        uint256 stakeDuration = block.timestamp - stakeInfo.stakedAt;
        
        // 1 week = 110%, 1 month = 130%, 3 months = 150%, 6 months = 175%, 1 year = 200%
        if (stakeDuration >= 365 days) return MAX_MULTIPLIER;
        if (stakeDuration >= 180 days) return 175;
        if (stakeDuration >= 90 days) return 150;
        if (stakeDuration >= 30 days) return 130;
        if (stakeDuration >= 7 days) return 110;
        
        return BASE_MULTIPLIER;
    }
    
    /**
     * @notice Remove token from user's staked tokens array
     * @param user The user address
     * @param tokenId The token ID to remove
     */
    function _removeFromUserStakedTokens(address user, uint256 tokenId) internal {
        uint256[] storage userTokens = userStakedTokens[user];
        for (uint256 i = 0; i < userTokens.length; i++) {
            if (userTokens[i] == tokenId) {
                // Move last element to this position and pop
                userTokens[i] = userTokens[userTokens.length - 1];
                userTokens.pop();
                break;
            }
        }
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update reward rate
     * @param newRate New reward rate per second
     */
    function setRewardRate(uint256 newRate) external onlyOwner {
        uint256 oldRate = rewardRatePerSecond;
        rewardRatePerSecond = newRate;
        emit RewardRateUpdated(oldRate, newRate);
    }
    
    /**
     * @notice Update cooldown period
     * @param newCooldown New cooldown in seconds
     */
    function setCooldown(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = unstakeCooldown;
        unstakeCooldown = newCooldown;
        emit CooldownUpdated(oldCooldown, newCooldown);
    }
    
    /**
     * @notice Update DAO treasury address
     * @param newTreasury New treasury address
     */
    function setDaoTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        daoTreasury = newTreasury;
    }
    
    /**
     * @notice Pause the staking contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the staking contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ ERC721 Receiver ============
    
    /**
     * @notice Handle ERC721 token received
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
    
    // ============ Receive Function ============
    
    /**
     * @notice Receive MON for reward distribution
     */
    receive() external payable {}
}
