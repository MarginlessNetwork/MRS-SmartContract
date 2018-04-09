const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MarginlessCrowdsale = artifacts.require("test/TestMarginlessCrowdsale.sol");
const MarginlessToken = artifacts.require("../contracts/MarginlessToken.sol");
const TokenTimelock = artifacts.require("zeppelin-solidity/contracts/token/TokenTimelock.sol");

contract('MarginlessCrowdsale Complex', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	let walletBalance;
	before(async () => {
		token = await MarginlessToken.new();
		contract = await MarginlessCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.icoEndTime(), contract.RATE()]);
		walletBalance = await web3.eth.getBalance(await contract.WALLET());
	});

	it('should always work', () => {});

	it('should manually mint tokens',  async () => {
		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(accounts[1]);
			amounts.push(OneToken);
		}
		await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(100));
	});

	it('manual minting moves stages', async () => {
		const stageBefore = await contract.currentStage();

		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(accounts[1]);
			amounts.push(OneToken.mul(600001));
		}
		await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(600001).mul(100).add(OneToken.mul(100)));
		expect(stageBefore).to.be.bignumber.equal(0);
		expect(await contract.currentStage()).to.be.bignumber.equal(1);
	});

	it('ether transfers moves multiple stages', async () => {
		await contract.setNow(1526292000);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(12500),
			gas: 300000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(3);
	});

    it('it is possible to buy tokens with 0 bonus when icoEndTime is manually moved', async () => {
        const defaultIcoEndTime = await contract.icoEndTime();

        await contract.setIcoEndTime(defaultIcoEndTime.add(2));
        await contract.setNow(defaultIcoEndTime.add(1));
        const balanceBefore = await token.balanceOf(accounts[1]);

        await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 300000
		});

        const balanceAfter = await token.balanceOf(accounts[1]);

        expect(await contract.currentStage()).to.be.bignumber.equal(5);
        expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneEther.mul(rate).floor());
    });

    it('should be possible to mint after ICO end and before finalize', async () => {
		await contract.setNow(end.add(10));

		const balanceBefore = await token.balanceOf(accounts[1]);
		await expect(contract.mintTokens([accounts[1]], [OneToken])).eventually.fulfilled;

		const balanceAfter = await token.balanceOf(accounts[1]);

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneToken);
	});

    it('should fail to accept funds after ICO end and before finalize', async () => {
        await expect(contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 300000
		})).eventually.rejected;
	});

});
