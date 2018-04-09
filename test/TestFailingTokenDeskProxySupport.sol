pragma solidity 0.4.19;
import "../contracts/TokenDeskProxySupport.sol";


contract TestFailingTokenDeskProxySupport is TokenDeskProxySupport {

    function buyTokens(address sender_, address benefeciary_, uint256 tokenDeskBonus_) external payable {
        // following require() are here to make solidity compiler happy about unused parameters
        require(sender_ != address(0));
        require(benefeciary_ != address(0));
        require(tokenDeskBonus_ >= 0);
        revert();
    }
}
