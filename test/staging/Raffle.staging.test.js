const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");
 // a unit test run on a local network whereas a staging test is only for a test network
developmentChains.includes(network.name) 
? describe.skip
: describe("Raffle Unit Tests", function() {
    let raffle, raffleEntranceFee, deployer

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        raffle = await ethers.getContract("Raffle",deployer)
        raffleEntranceFee = await raffle.getEntranceFee()
    })

    describe("fulfillRandomWords", function() {
        it("works with live chainlink keepers and chainlink vrf, we get a random winner", async function () {
            //enter the raffle
            const startingTimeStamp = await raffle.getLastTimeStamp()
            const accounts = await ethers.getSigners()

            await new Promise (async (resolve,reject) => {
                raffle.once("WinnerPicked", async () => {
                    console.log("WinnerPicked event fired!")
                    try{
                        const recentWinner = await raffle.getRecentWinner()
                        const raffleState = await raffle.getRaffleState()
                        const winnerBalance = await accounts[0].getBalance()
                        const endingTimeStamp = await raffle.getLastTimeStamp()

                        await expect(raffle.getPlayer(0)).to.be.reverted
                        assert.equal(recentWinner.toString(),accounts[0].address)
                        assert.equal(raffleState.toString(),"0")
                        assert(endingTimeStamp > startingTimeStamp)
                        resolve()
                    } catch(error) {
                        console.log(error)
                        reject(e)
                    } 
                })

                await raffle.enterRaffle({value: raffleEntranceFee})
                const winnerStartingBalance = await accounts[0].getBalance()
                // and this code wont complete until our listener has finished listening!
            })
        })
    })
})