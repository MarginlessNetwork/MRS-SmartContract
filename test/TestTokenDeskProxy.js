const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));
const ZeroTokens = new BigNumber(web3.toWei(0, 'ether'));

const MarginlessCrowdsale = artifacts.require("test/TestMarginlessCrowdsale.sol");
const MarginlessToken = artifacts.require("../contracts/MarginlessToken.sol");
const TokenDeskProxy = artifacts.require("../contracts/TokenDeskProxy.sol");

const TestFailingTokenDeskProxySupport = artifacts.require("test/TestFailingTokenDeskProxySupport.sol");

const TOKEN_DESK_BONUS = 4;

contract('TokenDeskProxy', async (accounts) => {
	let contract;
	let token;
	let proxy;
	let rate;
	let start;
	let end;
	before(async () => {
		token = await MarginlessToken.new();
		contract = await MarginlessCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		proxy = await TokenDeskProxy.new(contract.address, TOKEN_DESK_BONUS);
		await contract.setTokenDeskProxy(proxy.address);

		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE()]);
	});

	it('should always work', () => {});

    it('now owner cannot change token desk proxy address', async () => {
        await expect(contract.setTokenDeskProxy(accounts[1], { from: accounts[1] })).eventually.rejected;
    });

	it('should transfer ether to crowdsale contract when receiving ether', async () => {
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(0);
		const stage0Bonus = await contract.getStageBonus(0);
		await contract.setNow(start.add(1));

		await proxy.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 400000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(rate).add(OneEther.mul(rate).mul(stage0Bonus).div(100)).floor();
		expect(balanceAfter).to.be.bignumber.equal(tokens);
	});

	it('should have no ether on proxy balance', async () => {
		expect(await web3.eth.getBalance(proxy.address)).to.be.bignumber.equal(0);
	});

	it('should get bonus when transfering through TokenDeskProxy after stage 1', async () => {
		const [balanceBefore, phase1Date, stage2Bonus, largePurchaseBonus]
		=
		await Promise.all([
			token.balanceOf(accounts[1]),
			contract.getStageDate(1),
			contract.getStageBonus(2),
            contract.LARGE_PURCHASE_BONUS()
		]);
		await contract.setNow(phase1Date.add(1));

		await proxy.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(2),
			gas: 400000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(2).mul(rate).add(OneEther.mul(2).mul(rate).mul(stage2Bonus).div(100)).floor();
		const expectedTokens = tokens.add(tokens.mul(largePurchaseBonus.add(TOKEN_DESK_BONUS)).div(100)).floor();
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

});


contract('TestFailingTokenDeskProxySupport', async (accounts) => {
	it('should revert tx on TokenDeskProxySupport.buyTokens() failure', async () => {
		const contract = await TestFailingTokenDeskProxySupport.new();
		const proxy = await TokenDeskProxy.new(contract.address, TOKEN_DESK_BONUS);

		await expect(proxy.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 400000
		})).eventually.rejected;
	});
});
