const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MarginlessCrowdsale = artifacts.require("test/TestMarginlessCrowdsale.sol");
const MarginlessToken = artifacts.require("../contracts/MarginlessToken.sol");

contract('MarginlessCrowdsale Bad ICO', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	before(async () => {
		token = await MarginlessToken.new();
		contract = await MarginlessCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE()]);
	});

	it('should always work', () => {});

	it('ICO period should be 52 days', async () => {
		const icoDaysInSecs = (60 * 60 * 24 * 52);
		const period = (end - start);

		expect(period).to.be.equal(icoDaysInSecs);
	});

	it('should not accept funds before ICO start', async () => {
		await expect(contract.sendTransaction({
				from: accounts[1],
				value: OneEther
			}))
			.to.be.eventually.rejected;
	});

    it('accounts[1] must have 0 balance', async () => {
        expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(0);
    });

	it('should accept funds after startTime', async () => {
        const stage0Bonus = await contract.getStageBonus(0);
		await contract.setNow(start.add(1));

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});
		const balance = await token.balanceOf(accounts[1]);
		const expectedTokens = OneEther.mul(rate).add(OneEther.mul(rate).mul(stage0Bonus).div(100)).floor();
		expect(balance).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 0 to stage 2', async () => {
		const amount = OneEther.mul(2);
		const [balanceBefore,stage1Date,stage2Bonus,largePurchaseBonus]
            = await Promise.all([
                token.balanceOf(accounts[1]),
                contract.getStageDate(1),
                contract.getStageBonus(2),
                contract.LARGE_PURCHASE_BONUS()
            ]);

		await contract.setNow(stage1Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: amount,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(2);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = amount.mul(rate).add(amount.mul(rate).mul(stage2Bonus).div(100)).floor();
		const expectedTokens = tokens.add(tokens.mul(largePurchaseBonus).div(100).floor());

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 1 to stage 4', async () => {
        const stage3Date = await contract.getStageDate(3);

		await contract.setNow(stage3Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(4);
	});

	it('have 4 Ether in refundVault', async () => {
		expect(await web3.eth.getBalance(await contract.vault())).to.be.bignumber.equal(OneEther.mul(4));
	});

	it('should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('should successfully finalize unsuccessfull ICO', async () => {
		await contract.setNow(end.add(1));
		const tokens = await token.totalSupply();
		await expect(contract.finalize()).eventually.fulfilled;
		expect(await token.totalSupply()).to.be.bignumber.equal(tokens);
	});

	it('should get refund when sending tx with 0 ETH', async () => {
		let etherBalanceBefore = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		await contract.sendTransaction({
			from: accounts[1],
			value: 0
		});

		let etherBalanceAfter = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		expect(etherBalanceAfter - etherBalanceBefore).to.be.closeTo(4, 0.01);
	});
});
