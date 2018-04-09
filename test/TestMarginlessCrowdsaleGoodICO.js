const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const MarginlessCrowdsale = artifacts.require("test/TestMarginlessCrowdsale.sol");
const MarginlessToken = artifacts.require("../contracts/MarginlessToken.sol");
const EscrowVault = artifacts.require("../contracts/EscrowVault.sol");
const TokenTimelock = artifacts.require("zeppelin-solidity/contracts/token/TokenTimelock.sol");

contract('MarginlessCrowdsale Good ICO', async (accounts) => {
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

	it('ICO period should be 52 days', async () => {
		const icoDaysInSecs = (60 * 60 * 24 * 52);
		const period = (end - start);

		expect(period).to.be.equal(icoDaysInSecs);
	});

	it('should not accept funds before ICO start', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: OneEther
		})).eventually.rejected;
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

	it('fails to transfer tokens before ICO end', async () => {
		await expect(token.transfer(accounts[2], OneToken, {from : accounts[1]})).eventually.rejected;
	});

    it('should correctly pass from stage 0 to stage 1', async () => {
        const [stage0Date, stage0Cap, stage1Cap, stage1Bonus] = await Promise.all([
            contract.getStageDate(0),
            contract.getStageCap(0),
            contract.getStageCap(1),
            contract.getStageBonus(1),
        ]);

		await contract.setNow(stage0Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});
        const expectedTokens = OneEther.mul(rate).add(OneEther.mul(rate).mul(stage1Bonus).div(100)).floor();

		expect(await contract.currentStage()).to.be.bignumber.equal(1);
        expect(await contract.getStageCap(1)).to.be.bignumber.equal(stage0Cap.add(stage1Cap).sub(expectedTokens));
	});

	it('should correctly pass from stage 1 to stage 2', async () => {
		const investmentAmount = OneEther.mul(5000);
        const [balanceBefore, stage1Date, stage2Bonus, largePurchaseBonus]
            = await Promise.all([
                token.balanceOf(accounts[1]),
                contract.getStageDate(1),
                contract.getStageBonus(2),
                contract.LARGE_PURCHASE_BONUS()
            ]);

		await contract.setNow(stage1Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: investmentAmount,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(2);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(5000).mul(rate).add(OneEther.mul(5000).mul(rate).mul(stage2Bonus).div(100));
		const bonusTokens = tokens.mul(largePurchaseBonus).div(100);
		const expectedTokens = tokens.add(bonusTokens).floor();
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 2 to stage 3', async () => {
        const stage2Date = await contract.getStageDate(2);

		await contract.setNow(stage2Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(3);
	});

	it('should correctly pass from stage 3 to stage 4', async () => {
        const stage3Date = await contract.getStageDate(3);

        await contract.setNow(stage3Date.add(1));
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(4);
	});

	it('have 5004 Ether in escrowVault', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		const balance = walletBalanceAfter.sub(walletBalance).add(await web3.eth.getBalance(await contract.vault()));

		expect(balance).to.be.bignumber.equal(OneEther.mul(5004));
	});

	it('should send ether until hard cap', async () => {
		const [totalSupply, tokenCap, balanceBefore] =
			await Promise.all([token.totalSupply(), contract.ICO_TOKENS(), token.balanceOf(accounts[1])]);

		const tokensToMint = tokenCap.sub(totalSupply);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(20000),
			gas: 300000
		});

		const balanceAfter = await token.balanceOf(accounts[1]);

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tokensToMint);
		expect(await token.totalSupply()).to.be.bignumber.equal(tokenCap);
	});

	it('should successfully finalize successfull ICO before end', async () => {
		await contract.setNow(end.sub(1));
		await expect(contract.finalize()).eventually.fulfilled;
	});

	it('should not be possible to get refund', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: 0
		})).eventually.rejected;
	});

	it('should change token owner to token', async () => {
		const owner = await token.owner();
		expect(owner).to.be.equal(token.address);
	});

	it('should finish minting', async () => {
		expect(await token.mintingFinished()).to.be.equal(true);
	});

	it('succeeds to transfer tokens after ICO end', async () => {
		const balanceBefore = await token.balanceOf(accounts[2]);
		await expect(token.transfer(accounts[2], OneToken, {from : accounts[1]})).eventually.fulfilled;
		const balanceAfter = await token.balanceOf(accounts[2]);
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneToken);
	});

	it('should close vault after finalize()', async () => {
		const vault = await EscrowVault.at(await contract.vault());
		expect(await vault.state()).to.be.bignumber.equal(3); // Closed
	});

	it('should correctly initialize TokenTimelock', async () => {
		const teamTimelockAddr = await contract.teamTimelock();
		const companyTimelockAddr = await contract.companyTimelock();
		expect(teamTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');
		expect(companyTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');

		const teamTimelock = await TokenTimelock.at(teamTimelockAddr);
		const companyTimelock = await TokenTimelock.at(companyTimelockAddr);

		const [
			icoTokens,
			nowTime,
			teamAddr,
			teamReleaseTime,
			companyAddr,
			companyReleaseTime,
			teamBalance,
			companyBalance,
			teamWallet,
			teamTokensLockPeriod,
			teamTokens,
			airDropWallet,
			airDropTokens,
			jackpotWallet,
			jackpotTokens,
			companyWallet,
			companyTokens,
			companyTokensLockPeriod,
			icoTokensPercent,
			]
			=
			await Promise.all([
				contract.ICO_TOKENS(),
				contract.getNowTest(),
				teamTimelock.beneficiary(),
				teamTimelock.releaseTime(),
				companyTimelock.beneficiary(),
				companyTimelock.releaseTime(),
				token.balanceOf(teamTimelockAddr),
				token.balanceOf(companyTimelockAddr),
				contract.TEAM_WALLET(),
				contract.TEAM_TOKENS_LOCK_PERIOD(),
				contract.TEAM_TOKENS_PERCENT(),
				contract.AIRDROP_WALLET(),
				contract.AIRDROP_TOKENS_PERCENT(),
				contract.JACKPOT_WALLET(),
				contract.JACKPOT_TOKENS_PERCENT(),
				contract.COMPANY_WALLET(),
				contract.COMPANY_TOKENS_PERCENT(),
				contract.COMPANY_TOKENS_LOCK_PERIOD(),
				contract.ICO_TOKENS_PERCENT()
			]);

		expect(teamAddr).to.be.equal(teamWallet);

		expect(teamReleaseTime).to.be.bignumber.equal(teamTokensLockPeriod.add(nowTime));
		expect(teamBalance).to.be.bignumber.equal(teamTokens.mul(icoTokens).div(icoTokensPercent).floor());
		expect(companyAddr).to.be.equal(companyWallet);
		expect(companyReleaseTime).to.be.bignumber.equal(companyTokensLockPeriod.add(nowTime));
		expect(companyBalance).to.be.bignumber.equal(companyTokens.mul(icoTokens).div(icoTokensPercent).floor());
		expect(await token.balanceOf(airDropWallet)).to.be.bignumber.equal(airDropTokens.mul(icoTokens).div(icoTokensPercent).floor());
		expect(await token.balanceOf(jackpotWallet)).to.be.bignumber.equal(jackpotTokens.mul(icoTokens).div(icoTokensPercent).floor());
	});

	it('should mint all tokens', async () => {
		const [
			totalSupply,
			icoTokens,
			icoTokensPercent,
			teamTokens,
			airDropTokens,
			companyTokens,
			jackpotTokens]
			=
			await Promise.all([
			token.totalSupply(),
			contract.ICO_TOKENS(),
			contract.ICO_TOKENS_PERCENT(),
			contract.TEAM_TOKENS_PERCENT(),
			contract.AIRDROP_TOKENS_PERCENT(),
			contract.COMPANY_TOKENS_PERCENT(),
			contract.JACKPOT_TOKENS_PERCENT(),
			]);

		expect(totalSupply).to.be.bignumber.equal(
			icoTokens.add(
				teamTokens.add(airDropTokens).add(companyTokens).add(jackpotTokens).mul(icoTokens).div(icoTokensPercent).floor()
			)
		);
	});

});
