# Marginless
Smart Contracts for marginless.io ICO

## Deployment

1. Before deployment you have to change addresses in MarginlessCrowdsale.sol for:
    - WALLET (line 13)
    - TEAM_WALLET (line 15)
    - AIRDROP_WALLET (line 17)
    - COMPANY_WALLET (line 19)
    - JACKPOT_WALLET (line 21)

2. Recheck token name and symbol in MarginlessToken.sol (lines 11, 12).
3. First you have to deploy MarginlessToken.
4. Second you have to deploy MarginlessCrowdsale and give token smart-contract address into it.
5. Then you have to execute `transferOwnership` function on MarginlessToken with address of MarginlessCrowdsale smart-contract.
6. Then you have to deploy TokenDeskProxy and give MarginlessCrowdsale smart-contract address into it.
7. Then you have to execute `setTokenDeskProxy` on MarginlessCrowdsale smart-contract and pass address of TokenDeskProxy smart-contract.

P.S. You can also deploy it using `truffle migrate`.

## Testing

To run tests you have to run `ganache-cli` with additional parameters, because tests require wallets with lots of ether to test edge cases. By default `ganache-cli` gives 100 ether for generated accounts:

    ganache-cli --account="0x7a44e8791fdba705b42b5fd335215757714a3e7c60b9cc867f1318ac601c6f39,1000000000000000000000000000" --account="0x841803f6fb3e68a707e9dc3d592096e7d90531a9d38a8c57fbd166fdf98793d5,1000000000000000000000000000" --account="0xb73d0ec8fa9f45e0a3bc96eb1b95676725afc51ba0ba4f319e7a9a0c549bc365,1000000000000000000000000000"

And then in another console run tests

    $ truffle test


## Usage

### MarginlessCrowdsale

Crowdsale contract deployment consumes around 4 800 000 amount of gas. The smart-contract starts token sale after crowdsale start (`START_TIME` constant) and before crowdsale end (`icoEndTime` state variable). The crowdsale end date can be changed by calling `setIcoEndTime` function, but it have to be greater than current time. This function can be called only by the owner of the crowdsale smart-contract.

During ICO smart-contract will collect funds to EscrowVault contract. When soft-cap is reached it is possible to withdraw collected funds by calling `withdraw(uint256 weiAmount)` function of EscrowVault contract. This call will transfer chosen amount of collected funds to the `WALLET` address. This can be done only by the owner.

After crowdsale ends, owner must call `finalize` function. In case of successfull ICO (soft cap reached) this call will withdraw funds which were collected during ICO. In case of unsuccessful ICO (soft cap not reached) this call will unlock investor funds which can be returned by sending 0 ether to smart-contract or by calling `claimRefund` function.

A `finalize` function call will also stop token minting and transfer ownership of a token to token itself. This ensures that no one will ever have control over MarginlessToken smart-contract.

Smart-contract also supports manual token minting by calling `mintTokens(address[] _receivers, uint256[] _amounts)` function. This function can be called either by smart-contract owner or by a special account which can be set by calling `setTokenMinter` function. Only smart-contract owner can call `setTokenMinter` function.

`mintTokens(address[] _receivers, uint256[] _amounts)` function accepts two arguments. The first one is an array with addresses, the second one is an array with token amounts which must be assigned to appropriate address. Array lengths must be the same and must not exceed 100 items. When calling this function an event `ManualTokenMintRequiresRefund` can be raised. This event is used to signal that tokens which are to be distributed in an ICO are over. This event also contains information how much tokens cannot be minted and a refund to an address must be applied.

### MarginlessToken

Token contract deployment consumes around 1 700 000 amount of gas. Token contract is a standard ERC20 contract. Token transfers is enabled only after token minting is finished (`MarginlessCrowdsale.finalize()` function call).

### TokenDeskProxy

TokenDeskProxy smart-contract allows crowdsale smart-contract to assign an additional bonus to an inversor. To get additional bonus investor must deposit funds to this proxy contract. Then this contract will redirect received funds to the crowdsale contract with an additional bonus. TokenDesk bonus is specified at smart-contract deployment and cannot be changed. If bonus have to be changed new TokenDeskProxy proxy smart-contract must be deployed with new bonus value and address of TokenDeskProxy smart-contract must be specified through `MarginlessCrowdsale.setTokenDeskProxy()` function call.
