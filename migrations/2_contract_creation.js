const MarginlessCrowdsale = artifacts.require("./MarginlessCrowdsale.sol");
const MarginlessToken = artifacts.require("./MarginlessToken.sol");
const TokenDeskProxy = artifacts.require("./TokenDeskProxy.sol");
const TOKEN_DESK_BONUS = 4;

module.exports = function(deployer, network, addresses) {
	deployer.deploy(MarginlessToken).then(() => {
		return deployer.deploy(MarginlessCrowdsale, MarginlessToken.address);
	}).then(() => {
		return MarginlessToken.deployed();
	}).then((token) => {
		return token.transferOwnership(MarginlessCrowdsale.address);
	}).then(() => {
		return deployer.deploy(TokenDeskProxy, MarginlessCrowdsale.address, TOKEN_DESK_BONUS);
	}).then(() => {
		return MarginlessCrowdsale.deployed();
	}).then((contract) => {
		return contract.setTokenDeskProxy(TokenDeskProxy.address);
	});
};
