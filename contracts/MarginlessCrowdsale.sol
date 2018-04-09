pragma solidity 0.4.19;

import "zeppelin-solidity/contracts/token/ERC20/TokenTimelock.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";

import "./MarginlessToken.sol";
import "./TokenDeskProxyAware.sol";
import "./EscrowVault.sol";

contract MarginlessCrowdsale is TokenDeskProxyAware {
    using SafeMath for uint256;
    // Wallet where all ether will be moved after escrow withdrawal. Can be even multisig wallet
    address public constant WALLET = 0x1111111111111111111111111111111111111111;
    // Wallet for team tokens
    address public constant TEAM_WALLET = 0x2222222222222222222222222222222222222222;
    // Wallet for Airdrop/referall/affiliate tokens
    address public constant AIRDROP_WALLET = 0x3333333333333333333333333333333333333333;
    // Wallet for company tokens
    address public constant COMPANY_WALLET = 0x4444444444444444444444444444444444444444;
    // Wallet for jackpot tokens
    address public constant JACKPOT_WALLET = 0x5555555555555555555555555555555555555555;

    uint256 public constant TEAM_TOKENS_LOCK_PERIOD = 60 * 60 * 24 * 365; // 365 days
    uint256 public constant COMPANY_TOKENS_LOCK_PERIOD = 60 * 60 * 24 * 180; // 180 days
    uint256 public constant SOFT_CAP = 40000000e18; // 40 000 000
    uint256 public constant ICO_TOKENS = 210000000e18; // 210 000 000
    uint256 public constant START_TIME = 1523268000; // 2018/04/09 10:00 UTC +0
    uint256 public constant RATE = 10000;  // 0.0001 ETH
    uint256 public constant LARGE_PURCHASE = 12500e18; // 12 500 tokens

    uint256 public icoEndTime = 1527760800; // 2018/05/31 10:00 UTC +0
    uint8 public constant ICO_TOKENS_PERCENT = 70;
    uint8 public constant TEAM_TOKENS_PERCENT = 10;
    uint8 public constant COMPANY_TOKENS_PERCENT = 10;
    uint8 public constant AIRDROP_TOKENS_PERCENT = 5;
    uint8 public constant JACKPOT_TOKENS_PERCENT = 5;

    uint8 public constant LARGE_PURCHASE_BONUS = 5;

    Stage[] internal stages;

    struct Stage {
        uint256 cap;
        uint64 till;
        uint8 bonus;
    }

    // The token being sold
    MarginlessToken public token;

    // amount of raised money in wei
    uint256 public weiRaised;

    // refund vault used to hold funds while crowdsale is running
    EscrowVault public vault;

    uint256 public currentStage = 0;
    bool public isFinalized = false;

    address private tokenMinter;

    TokenTimelock public teamTimelock;
    TokenTimelock public companyTimelock;

    /**
    * event for token purchase logging
    * @param purchaser who paid for the tokens
    * @param beneficiary who got the tokens
    * @param value weis paid for purchase
    * @param amount amount of tokens purchased
    */
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

    event Finalized();
    /**
     * When there no tokens left to mint and token minter tries to manually mint tokens
     * this event is raised to signal how many tokens we have to charge back to purchaser
     */
    event ManualTokenMintRequiresRefund(address indexed purchaser, uint256 value);

    function MarginlessCrowdsale(address _token) public {
        stages.push(Stage({ till: 1523440800, bonus: 29, cap: 40000000e18 }));    // 2018/04/11 10:00 UTC +0
        stages.push(Stage({ till: 1523786400, bonus: 25, cap: 170000000e18 }));   // 2018/04/15 10:00 UTC +0
        stages.push(Stage({ till: 1525082400, bonus: 20, cap: 0 }));              // 2018/04/30 10:00 UTC +0
        stages.push(Stage({ till: 1526292000, bonus: 10, cap: 0 }));              // 2018/05/14 10:00 UTC +0
        stages.push(Stage({ till: 1527760800, bonus: 0,	cap: 0 }));              // 2018/05/31 10:00 UTC +0
        stages.push(Stage({ till: ~uint64(0), bonus: 0,	cap: 0 }));              // unlimited

        token = MarginlessToken(_token);
        vault = new EscrowVault(msg.sender, WALLET);  // Wallet where all ether will be stored during ICO
    }

    modifier onlyTokenMinterOrOwner() {
        require(msg.sender == tokenMinter || msg.sender == owner);
        _;
    }

    function internalBuyTokens(address sender, address beneficiary, uint256 tokenDeskBonus) internal {
        require(beneficiary != address(0));
        require(sender != address(0));
        require(validPurchase());

        uint256 weiAmount = msg.value;
        uint256 nowTime = getNow();
        // this loop moves stages and ensures correct stage according to date
        while (currentStage < stages.length && stages[currentStage].till < nowTime) {
            // move all unsold tokens to next stage
            uint256 nextStage = currentStage.add(1);
            stages[nextStage].cap = stages[nextStage].cap.add(stages[currentStage].cap);
            stages[currentStage].cap = 0;
            currentStage = nextStage;
        }

        // calculate token amount to be created
        uint256 tokens = calculateTokens(weiAmount, tokenDeskBonus);

        uint256 excess = appendContribution(beneficiary, tokens);
        uint256 refund = (excess > 0 ? excess.mul(weiAmount).div(tokens) : 0);
        weiAmount = weiAmount.sub(refund);
        weiRaised = weiRaised.add(weiAmount);

        if (refund > 0) { // hard cap reached, no more tokens to mint
            sender.transfer(refund);
        }

        TokenPurchase(sender, beneficiary, weiAmount, tokens.sub(excess));

        if (goalReached() && vault.state() == EscrowVault.State.Active) {
            vault.setGoalReached();
        }
        vault.deposit.value(weiAmount)(sender);
    }

    function calculateTokens(uint256 _weiAmount, uint256 _tokenDeskBonus) internal view returns (uint256) {
        uint256 tokens = _weiAmount.mul(RATE);

        if (stages[currentStage].bonus > 0) {
            uint256 stageBonus = tokens.mul(stages[currentStage].bonus).div(100);
            tokens = tokens.add(stageBonus);
        }

        if (currentStage < 2) return tokens;

        uint256 bonus = _tokenDeskBonus.add(tokens >= LARGE_PURCHASE ? LARGE_PURCHASE_BONUS : 0);
        return tokens.add(tokens.mul(bonus).div(100));
    }

    function appendContribution(address _beneficiary, uint256 _tokens) internal returns (uint256) {
        uint256 excess = _tokens;
        uint256 tokensToMint = 0;

        while (excess > 0 && currentStage < stages.length) {
            Stage storage stage = stages[currentStage];
            if (excess >= stage.cap) {
                excess = excess.sub(stage.cap);
                tokensToMint = tokensToMint.add(stage.cap);
                stage.cap = 0;
                currentStage = currentStage.add(1);
            } else {
                stage.cap = stage.cap.sub(excess);
                tokensToMint = tokensToMint.add(excess);
                excess = 0;
            }
        }
        if (tokensToMint > 0) {
            token.mint(_beneficiary, tokensToMint);
        }
        return excess;
    }

    // @return true if the transaction can buy tokens
    function validPurchase() internal view returns (bool) {
        bool withinPeriod = getNow() >= START_TIME && getNow() <= icoEndTime;
        bool nonZeroPurchase = msg.value != 0;
        bool canMint = token.totalSupply() < ICO_TOKENS;
        bool validStage = (currentStage < stages.length);
        return withinPeriod && nonZeroPurchase && canMint && validStage;
    }

    // if crowdsale is unsuccessful, investors can claim refunds here
    function claimRefund() public {
        require(isFinalized);
        require(!goalReached());

        vault.refund(msg.sender);
    }

    /**
    * @dev Must be called after crowdsale ends, to do some extra finalization
    * work. Calls the contract's finalization function.
    */
    function finalize() public onlyOwner {
        require(!isFinalized);
        require(getNow() > icoEndTime || token.totalSupply() == ICO_TOKENS);

        if (goalReached()) {
            // Close escrowVault and transfer all collected ethers into WALLET address
            if (vault.state() != EscrowVault.State.Closed) {
                vault.close();
            }

            uint256 totalSupply = token.totalSupply();

            teamTimelock = new TokenTimelock(token, TEAM_WALLET, getNow().add(TEAM_TOKENS_LOCK_PERIOD));
            token.mint(teamTimelock, uint256(TEAM_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT));

            companyTimelock = new TokenTimelock(token, COMPANY_WALLET, getNow().add(COMPANY_TOKENS_LOCK_PERIOD));
            token.mint(companyTimelock, uint256(COMPANY_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT));

            token.mint(AIRDROP_WALLET, uint256(AIRDROP_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT));

            token.mint(JACKPOT_WALLET, uint256(JACKPOT_TOKENS_PERCENT).mul(totalSupply).div(ICO_TOKENS_PERCENT));

            token.finishMinting();
            token.transferOwnership(token);
        } else {
            vault.enableRefunds();
        }
        Finalized();
        isFinalized = true;
    }

    function goalReached() public view returns (bool) {
        return token.totalSupply() >= SOFT_CAP;
    }

    // fallback function can be used to buy tokens or claim refund
    function () external payable {
        if (!isFinalized) {
            buyTokens(msg.sender);
        } else {
            claimRefund();
        }
    }

    function mintTokens(address[] _receivers, uint256[] _amounts) external onlyTokenMinterOrOwner {
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        for (uint256 i = 0; i < _receivers.length; i++) {
            address receiver = _receivers[i];
            uint256 amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            uint256 excess = appendContribution(receiver, amount);

            if (excess > 0) {
                ManualTokenMintRequiresRefund(receiver, excess);
            }
        }
    }

    function setIcoEndTime(uint256 _endTime) public onlyOwner {
        require(_endTime > START_TIME && _endTime > getNow());
        icoEndTime = _endTime;
    }

    function setTokenMinter(address _tokenMinter) public onlyOwner {
        require(_tokenMinter != address(0));
        tokenMinter = _tokenMinter;
    }

    function getNow() internal view returns (uint256) {
        return now;
    }
}
