pragma solidity ^0.4.18;

import '../contracts/MarginlessCrowdsale.sol';

contract TestMarginlessCrowdsale is MarginlessCrowdsale {
	uint256 testNow;
	function TestMarginlessCrowdsale(address _token) MarginlessCrowdsale(_token) public {
	}

	function setNow(uint256 _now) public {
		testNow = _now;
	}

	function getNow() internal view returns (uint256) {
		return testNow;
	}

	function getNowTest() public view returns (uint256) {
		return getNow();
	}

    function getStageDate(uint256 _stage) public view returns(uint256) {
        return stages[_stage].till;
    }

    function getStageBonus(uint256 _stage) public view returns (uint8) {
        return stages[_stage].bonus;
    }

    function getStageCap(uint256 _stage) public view returns (uint256) {
        return stages[_stage].cap;
    }
}
