pragma solidity 0.4.19;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./TokenDeskProxySupport.sol";


contract TokenDeskProxyAware is TokenDeskProxySupport, Ownable {

    address private tokenDeskProxy;

    modifier onlyTokenDeskProxy() {
        require(msg.sender == tokenDeskProxy);
        _;
    }

    function buyTokens(address beneficiary) public payable {
        internalBuyTokens(msg.sender, beneficiary, 0);
    }

    function buyTokens(address sender, address beneficiary, uint256 tokenDeskBonus) external payable onlyTokenDeskProxy {
        internalBuyTokens(sender, beneficiary, tokenDeskBonus);
    }

    function setTokenDeskProxy(address tokenDeskProxy_) public onlyOwner {
        require(tokenDeskProxy_ != address(0));
        tokenDeskProxy = tokenDeskProxy_;
    }

    function internalBuyTokens(address sender, address beneficiary, uint256 tokenDeskBonus) internal;
}
