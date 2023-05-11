const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25")
const GAS_PRICE_LINK = 1e9//Calculated value based on the gas price of the chain.

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy,log} = deployments;
  const {deployer} = await getNamedAccounts();
  const args = [BASE_FEE,GAS_PRICE_LINK]
  
if(developmentChains.includes(network.name)) {
    console.log("Local network detected! Deploying mocks..")
    //deploy a mock vrfcoordintor..
    await deploy("VRFCoordinatorV2Mock",{
        from: deployer,
        log: true,
        args: args,
    })
    log("Mocks Ddeployed!")
    log("------------------------------------")
}
}

module.exports.tags = ["all","mocks"]