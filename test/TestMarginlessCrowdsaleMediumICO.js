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

contract('MarginlessCrowdsale Medium ICO', async (accounts) => {
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

	it('should correctly pass from stage 0 to stage 1 when stage 0 cap reached', async () => {
		const investmentAmount = OneEther.mul(5000);
        const [balanceBefore,stage0Bonus]
            = await Promise.all([
                token.balanceOf(accounts[1]),
                contract.getStageBonus(0)
            ]);
		await contract.sendTransaction({
			from: accounts[1],
			value: investmentAmount,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(1);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = investmentAmount.mul(rate).add(investmentAmount.mul(rate).mul(stage0Bonus).div(100)).floor();
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tokens);
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

	it('have 5002 Ether on balance', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		const balance = walletBalanceAfter.sub(walletBalance).add(await web3.eth.getBalance(await contract.vault()));

		expect(balance).to.be.bignumber.equal(OneEther.mul(5002));
	});

	it('should be able to withdraw ether from EscrowVault after soft cap reached', async () => {
        const vault = await contract.vault();
        const vaultContract = EscrowVault.at(vault);

        await vaultContract.withdraw(100e18);
        const balance = await web3.eth.getBalance(vault);
        expect(balance).to.be.bignumber.equal(OneEther.mul(4902))
    });

	it('should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('should successfully finalize successfull ICO', async () => {
		const wallet = await contract.WALLET();

        const totalSupply = await token.totalSupply();

		await contract.setNow(end.add(1));
		await expect(contract.finalize()).eventually.fulfilled;

		const etherBalanceAfter = await web3.eth.getBalance(wallet);
		expect(web3.fromWei(etherBalanceAfter.sub(walletBalance)).toNumber()).to.be.closeTo(5002, 0.01);
	});

	it('should not be possible to get refund', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: 0
		})).eventually.rejected;
	});

	it('should change token owner to token', async () => {
		expect(await token.owner()).to.be.equal(token.address);
	});

	it('should finish minting', async () => {
		expect(await token.mintingFinished()).to.be.equal(true);
	});

	it('should correctly finalize crowdsale', async () => {
		const teamTimelockAddr = await contract.teamTimelock();
		const companyTimelockAddr = await contract.companyTimelock();
		expect(teamTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');
		expect(companyTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');

		const teamTimelock = await TokenTimelock.at(teamTimelockAddr);
		const companyTimelock = await TokenTimelock.at(companyTimelockAddr);

		const [
			icoTokens,
			lastStageCap,
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
			airdropWallet,
			airdropTokens,
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
				contract.getStageCap(4),
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

		const soldTokens = icoTokens.sub(lastStageCap);

		expect(teamAddr).to.be.equal(teamWallet);

		expect(teamReleaseTime).to.be.bignumber.equal(teamTokensLockPeriod.add(nowTime));
		expect(teamBalance).to.be.bignumber.equal(teamTokens.mul(soldTokens).div(icoTokensPercent).floor());
		expect(companyAddr).to.be.equal(companyWallet);
		expect(companyReleaseTime).to.be.bignumber.equal(companyTokensLockPeriod.add(nowTime));
		expect(companyBalance).to.be.bignumber.equal(companyTokens.mul(soldTokens).div(icoTokensPercent).floor());
		expect(await token.balanceOf(airdropWallet)).to.be.bignumber.equal(airdropTokens.mul(soldTokens).div(icoTokensPercent).floor());
		expect(await token.balanceOf(jackpotWallet)).to.be.bignumber.equal(jackpotTokens.mul(soldTokens).div(icoTokensPercent).floor());

	});
});
