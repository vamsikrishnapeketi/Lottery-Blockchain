const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name) 
? describe.skip
: describe("Raffle Unit Tests", function() {
    let raffle,vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
    const chainId = network.config.chainId

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        raffle = await ethers.getContract("Raffle",deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock",deployer)
        raffleEntranceFee = await raffle.getEntranceFee()
        interval = await raffle.getInterval()
    })

    describe("constructor", function() {
        it("Initializes the raffle correctly", async function () {
            const raffleState = await raffle.getRaffleState()
            assert.equal(raffleState.toString(),"0")
            assert.equal(interval.toString(),networkConfig[chainId]["interval"])
        })
    })

    describe("enterRaffle", function () {
        it("reverts when you don't pay enough",async function () {
            await expect(raffle.enterRaffle()).to.be.revertedWith(
                "Raffle_NotEnoughETHEntered"
            )  
        })
        it("records the players when they enter",async function() {
                await raffle.enterRaffle({value: raffleEntranceFee})
                const playerFromContract = await raffle.getPlayer(0)
                assert.equal(playerFromContract, deployer)
        })
        it("emits event on enter",async function() {
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.emit(
                raffle,
                "RaffleEnter"
            )
        })
        it("doesnt allow entrance when raffle is calculating",async function() {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            // Now we have increased the time interval and all the upkeepNeeded ifs made true
            //now we pretend to be a chainlink kepeer that is we do performupkeep and make the state to be calculating
            await raffle.performUpkeep([])
            //now it has to revert with an error
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWith("Raffle_NotOpen")
        })
    })
    describe("checkUpkeep", function () {
         it("returns false if people havent sent any ETH",async function() {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            //since checkupkeep is a public function is we use await raffle.checkupkeep this will do a transaction but we do not want that hence we use callstatic
            //to simulate the checkupkeep and get us the value of bool upkeepneeded
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
         })
         it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep([]) // changes the state to calculating
                  const raffleState = await raffle.getRaffleState() // stores the new state
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
    })
    describe("performUpkeep", function() {
         it("it can only run if checkupkeep is true", async function() {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const tx = await raffle.performUpkeep([])
            assert(tx)
         })
         it("reverts when checkupkeep is false", async function () {
            await expect(raffle.performUpkeep([])).to.be.revertedWith
            (
                "Raffle_UpkeepNotNeeded"
            )
         })
         it("updates the raffle state and emits a requestId", async function() {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const txResponse = await raffle.performUpkeep([])
            const txReceipt = await txResponse.wait(1)
            const requestId = txReceipt.events[1].args.requestId
            const raffleState = await raffle.getRaffleState()
            assert(requestId.toNumber() > 0)
            assert(raffleState.toString() == "1")
         })
    })
    describe("fulfillRandomWords",function() {
        beforeEach(async function () {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
        })
        it("can only be called after performupkeep",async function() {
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith(
                "nonexistent request"
            )
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith(
                "nonexistent request"
            )
        })
        it("picks a winner, resets the lottery, and sends money", async function() {
            const additionalEntrants = 3
            const startingAccountIndex = 1 // deployer is 0
            const accounts = await ethers.getSigners()
            for(let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants;
                i++) {
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle({value: raffleEntranceFee})
                }
                const startingTimeStamp = await raffle.getLastTimeStamp()
                 await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => { //Listener - it will listen for that event to take place
                        console.log("Found the event!")
                        try {
                                const recentWinner = await raffle.getRecentWinner()
                                console.log(recentWinner)
                                console.log(accounts[2].address)
                                console.log(accounts[0].address)
                                console.log(accounts[1].address)
                                console.log(accounts[3].address)
                                const  raffleState = await raffle.getRaffleState()
                                const endingTimeStamp = await raffle.getLastTimeStamp()
                                const numPlayers = await raffle.getNumberOfPlayers()
                                const winnerEndingBalance = await accounts[1].getBalance()
                                assert.equal(numPlayers.toString(), "0")
                                assert.equal(raffleState.toString(), "0")
                                assert(endingTimeStamp > startingTimeStamp) 

                    }catch(e) {
                        reject(e)
                    }
                        resolve()
                    })
                    const tx = await raffle.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        raffle.address
                    )
                 })
        })
    })
})