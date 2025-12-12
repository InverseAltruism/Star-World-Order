// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title StarWorldOrderGovernor
 * @author Star World Order DAO
 * @notice Governance contract for Star World Order DAO on Monad
 * @dev NFT-weighted voting governance for Star Skrumpey holders
 * 
 * Key Features:
 * - One Star Skrumpey = One Vote
 * - NFT-based voting power (must hold Star Skrumpey to vote)
 * - Proposal creation, voting, and execution
 * - Configurable voting periods and quorum
 * - Treasury management through governance
 * 
 * Deployed on Monad (Chain ID: 143)
 * 
 * Inspired by:
 * - OpenZeppelin Governor framework
 * - Compound Governance Bravo
 * - Nouns DAO governance model
 */
contract StarWorldOrderGovernor is ReentrancyGuard, Ownable, Pausable {
    
    // ============ Constants ============
    
    /// @notice Minimum voting period in blocks (approximately 1 day on Monad)
    uint256 public constant MIN_VOTING_PERIOD = 1000;
    
    /// @notice Maximum voting period in blocks (approximately 14 days on Monad)
    uint256 public constant MAX_VOTING_PERIOD = 200000;
    
    /// @notice Maximum number of actions in a proposal
    uint256 public constant PROPOSAL_MAX_OPERATIONS = 10;
    
    // ============ State Variables ============
    
    /// @notice Star Skrumpey NFT contract
    IERC721 public immutable starSkrumpeyNFT;
    
    /// @notice Counter for proposal IDs
    uint256 public proposalCount;
    
    /// @notice Voting period in blocks
    uint256 public votingPeriod;
    
    /// @notice Voting delay after proposal creation (in blocks)
    uint256 public votingDelay;
    
    /// @notice Minimum quorum (minimum votes required for proposal to pass)
    uint256 public quorumThreshold;
    
    /// @notice Minimum Star Skrumpeys required to create a proposal
    uint256 public proposalThreshold;
    
    /// @notice Mapping of proposal ID to Proposal
    mapping(uint256 => Proposal) public proposals;
    
    /// @notice Mapping of proposal ID => voter address => has voted
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    
    /// @notice Mapping of proposal ID => voter address => vote support
    mapping(uint256 => mapping(address => bool)) public voteSupport;
    
    /// @notice Mapping of proposal ID => voter address => vote weight
    mapping(uint256 => mapping(address => uint256)) public voteWeight;
    
    // ============ Enums ============
    
    /// @notice Possible states for a proposal
    enum ProposalState {
        Pending,    // Created but voting hasn't started
        Active,     // Currently in voting period
        Defeated,   // Failed to reach quorum or more votes against
        Succeeded,  // Passed the vote
        Executed,   // Has been executed
        Cancelled   // Cancelled by proposer or admin
    }
    
    // ============ Structs ============
    
    /// @notice Proposal structure
    struct Proposal {
        uint256 id;              // Unique proposal ID
        address proposer;        // Address that created the proposal
        string title;            // Short title
        string description;      // Full description
        uint256 startBlock;      // Block when voting starts
        uint256 endBlock;        // Block when voting ends
        uint256 forVotes;        // Votes in favor
        uint256 againstVotes;    // Votes against
        bool executed;           // Whether the proposal was executed
        bool cancelled;          // Whether the proposal was cancelled
        uint256 createdAt;       // Timestamp of creation
    }
    
    // ============ Events ============
    
    /// @notice Emitted when a proposal is created
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        string description,
        uint256 startBlock,
        uint256 endBlock
    );
    
    /// @notice Emitted when a vote is cast
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight,
        string reason
    );
    
    /// @notice Emitted when a proposal is executed
    event ProposalExecuted(uint256 indexed proposalId);
    
    /// @notice Emitted when a proposal is cancelled
    event ProposalCancelled(uint256 indexed proposalId);
    
    /// @notice Emitted when voting period is updated
    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    
    /// @notice Emitted when voting delay is updated
    event VotingDelayUpdated(uint256 oldDelay, uint256 newDelay);
    
    /// @notice Emitted when quorum is updated
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    
    /// @notice Emitted when proposal threshold is updated
    event ProposalThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    
    // ============ Errors ============
    
    /// @notice Thrown when caller doesn't hold any Star Skrumpeys
    error NotStarSkrumpeyHolder();
    
    /// @notice Thrown when caller doesn't have enough NFTs to propose
    error InsufficientProposalThreshold();
    
    /// @notice Thrown when proposal doesn't exist
    error ProposalNotFound();
    
    /// @notice Thrown when proposal is not in valid state for action
    error InvalidProposalState();
    
    /// @notice Thrown when user has already voted
    error AlreadyVoted();
    
    /// @notice Thrown when voting period is invalid
    error InvalidVotingPeriod();
    
    /// @notice Thrown when title or description is empty
    error EmptyProposalContent();
    
    /// @notice Thrown when caller is not the proposer
    error NotProposer();
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the governance contract
     * @param _starSkrumpeyNFT Address of Star Skrumpey NFT contract
     * @param _votingPeriod Initial voting period in blocks
     * @param _votingDelay Initial voting delay in blocks
     * @param _quorumThreshold Initial quorum threshold
     * @param _proposalThreshold Minimum NFTs to create proposal
     */
    constructor(
        address _starSkrumpeyNFT,
        uint256 _votingPeriod,
        uint256 _votingDelay,
        uint256 _quorumThreshold,
        uint256 _proposalThreshold
    ) Ownable(msg.sender) {
        require(_starSkrumpeyNFT != address(0), "Invalid NFT address");
        require(_votingPeriod >= MIN_VOTING_PERIOD && _votingPeriod <= MAX_VOTING_PERIOD, "Invalid voting period");
        
        starSkrumpeyNFT = IERC721(_starSkrumpeyNFT);
        votingPeriod = _votingPeriod;
        votingDelay = _votingDelay;
        quorumThreshold = _quorumThreshold;
        proposalThreshold = _proposalThreshold;
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Create a new proposal
     * @param title Short title of the proposal
     * @param description Full description of the proposal
     * @return proposalId The ID of the new proposal
     */
    function propose(
        string calldata title,
        string calldata description
    ) external whenNotPaused returns (uint256 proposalId) {
        // Check that proposer holds enough Star Skrumpeys
        uint256 balance = starSkrumpeyNFT.balanceOf(msg.sender);
        if (balance == 0) revert NotStarSkrumpeyHolder();
        if (balance < proposalThreshold) revert InsufficientProposalThreshold();
        
        // Validate content
        if (bytes(title).length == 0 || bytes(description).length == 0) {
            revert EmptyProposalContent();
        }
        
        // Create proposal
        proposalCount++;
        proposalId = proposalCount;
        
        uint256 startBlock = block.number + votingDelay;
        uint256 endBlock = startBlock + votingPeriod;
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            title: title,
            description: description,
            startBlock: startBlock,
            endBlock: endBlock,
            forVotes: 0,
            againstVotes: 0,
            executed: false,
            cancelled: false,
            createdAt: block.timestamp
        });
        
        emit ProposalCreated(proposalId, msg.sender, title, description, startBlock, endBlock);
    }
    
    /**
     * @notice Cast a vote on a proposal
     * @param proposalId The ID of the proposal
     * @param support True for voting in favor, false for voting against
     * @param reason Optional reason for the vote
     */
    function castVote(
        uint256 proposalId,
        bool support,
        string calldata reason
    ) external whenNotPaused nonReentrant {
        // Check that voter holds Star Skrumpeys
        uint256 weight = starSkrumpeyNFT.balanceOf(msg.sender);
        if (weight == 0) revert NotStarSkrumpeyHolder();
        
        // Get proposal
        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound();
        
        // Check proposal is active
        if (getProposalState(proposalId) != ProposalState.Active) {
            revert InvalidProposalState();
        }
        
        // Check hasn't voted yet
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();
        
        // Record vote
        hasVoted[proposalId][msg.sender] = true;
        voteSupport[proposalId][msg.sender] = support;
        voteWeight[proposalId][msg.sender] = weight;
        
        // Update vote counts
        if (support) {
            proposal.forVotes += weight;
        } else {
            proposal.againstVotes += weight;
        }
        
        emit VoteCast(proposalId, msg.sender, support, weight, reason);
    }
    
    /**
     * @notice Execute a successful proposal
     * @param proposalId The ID of the proposal to execute
     */
    function execute(uint256 proposalId) external whenNotPaused nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound();
        
        // Check proposal succeeded
        if (getProposalState(proposalId) != ProposalState.Succeeded) {
            revert InvalidProposalState();
        }
        
        // Mark as executed
        proposal.executed = true;
        
        emit ProposalExecuted(proposalId);
    }
    
    /**
     * @notice Cancel a proposal
     * @param proposalId The ID of the proposal to cancel
     */
    function cancel(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound();
        
        // Only proposer or owner can cancel
        if (msg.sender != proposal.proposer && msg.sender != owner()) {
            revert NotProposer();
        }
        
        // Can only cancel pending or active proposals
        ProposalState state = getProposalState(proposalId);
        if (state != ProposalState.Pending && state != ProposalState.Active) {
            revert InvalidProposalState();
        }
        
        proposal.cancelled = true;
        
        emit ProposalCancelled(proposalId);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get the state of a proposal
     * @param proposalId The ID of the proposal
     * @return The current state of the proposal
     */
    function getProposalState(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound();
        
        if (proposal.cancelled) {
            return ProposalState.Cancelled;
        }
        
        if (proposal.executed) {
            return ProposalState.Executed;
        }
        
        if (block.number < proposal.startBlock) {
            return ProposalState.Pending;
        }
        
        if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        }
        
        // Voting period has ended
        uint256 totalVotes = proposal.forVotes + proposal.againstVotes;
        if (totalVotes < quorumThreshold || proposal.againstVotes >= proposal.forVotes) {
            return ProposalState.Defeated;
        }
        
        return ProposalState.Succeeded;
    }
    
    /**
     * @notice Get proposal details
     * @param proposalId The ID of the proposal
     * @return The proposal struct
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }
    
    /**
     * @notice Get voting power of an address
     * @param account The address to check
     * @return The voting power (number of Star Skrumpeys)
     */
    function getVotingPower(address account) external view returns (uint256) {
        return starSkrumpeyNFT.balanceOf(account);
    }
    
    /**
     * @notice Get vote receipt for a voter on a proposal
     * @param proposalId The ID of the proposal
     * @param voter The voter address
     * @return hasVotedBool Whether the voter has voted
     * @return support Whether they voted for or against
     * @return weight The weight of their vote
     */
    function getReceipt(uint256 proposalId, address voter) 
        external 
        view 
        returns (bool hasVotedBool, bool support, uint256 weight) 
    {
        hasVotedBool = hasVoted[proposalId][voter];
        support = voteSupport[proposalId][voter];
        weight = voteWeight[proposalId][voter];
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update voting period
     * @param newVotingPeriod New voting period in blocks
     */
    function setVotingPeriod(uint256 newVotingPeriod) external onlyOwner {
        if (newVotingPeriod < MIN_VOTING_PERIOD || newVotingPeriod > MAX_VOTING_PERIOD) {
            revert InvalidVotingPeriod();
        }
        uint256 oldPeriod = votingPeriod;
        votingPeriod = newVotingPeriod;
        emit VotingPeriodUpdated(oldPeriod, newVotingPeriod);
    }
    
    /**
     * @notice Update voting delay
     * @param newVotingDelay New voting delay in blocks
     */
    function setVotingDelay(uint256 newVotingDelay) external onlyOwner {
        uint256 oldDelay = votingDelay;
        votingDelay = newVotingDelay;
        emit VotingDelayUpdated(oldDelay, newVotingDelay);
    }
    
    /**
     * @notice Update quorum threshold
     * @param newQuorum New quorum threshold
     */
    function setQuorumThreshold(uint256 newQuorum) external onlyOwner {
        uint256 oldQuorum = quorumThreshold;
        quorumThreshold = newQuorum;
        emit QuorumUpdated(oldQuorum, newQuorum);
    }
    
    /**
     * @notice Update proposal threshold
     * @param newThreshold New proposal threshold
     */
    function setProposalThreshold(uint256 newThreshold) external onlyOwner {
        uint256 oldThreshold = proposalThreshold;
        proposalThreshold = newThreshold;
        emit ProposalThresholdUpdated(oldThreshold, newThreshold);
    }
    
    /**
     * @notice Pause the governance contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the governance contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
