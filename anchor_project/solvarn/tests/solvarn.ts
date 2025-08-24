import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solvarn } from "../target/types/solvarn";
import { assert } from "chai";

describe("solvarn", () => {
  // Configure the client to use the local cluster.

  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.solvarn as Program<Solvarn>;

  const poolAuthority = anchor.web3.Keypair.generate();

  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();
  const charlie = anchor.web3.Keypair.generate();

  const [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), poolAuthority.publicKey.toBuffer()],
    program.programId
  );

  const POOL_DURATION = 10;

  describe("Initialize Pool", () => {
    it("Pool initialized successfully", async () => {
      await airdrop(provider.connection, poolAuthority.publicKey);

      // Call the initPool instruction with a specific duration
      await program.methods
        .initPool(new anchor.BN(POOL_DURATION))
        .accounts({
          authority: poolAuthority.publicKey,
        })
        .signers([poolAuthority])
        .rpc({ commitment: "confirmed" });

      // Fetch the newly created pool account
      const poolAccount = await program.account.pool.fetch(poolPDA);

      // Assert that the pool authority is correctly set
      assert.strictEqual(
        poolAccount.authority.toString(),
        poolAuthority.publicKey.toString(),
        "Pool authority should be poolAuthority's public key"
      );

      // Assert that the pool is marked as active/open
      assert.strictEqual(poolAccount.gameActive, true, "Pool should be open");
    });

    it("Cannot initialize pool twice (Authority tries to initialize again)", async () => {
      let flag = "This should fail";

      try {
        await program.methods
          .initPool(new anchor.BN(60 * 5))
          .accounts({
            authority: poolAuthority.publicKey,
          })
          .rpc({ commitment: "confirmed" });
      } catch (error) {
        flag = "Failed";

        // Should fail because account already exists
        assert.isTrue(
          error.toString().includes("already in use") ||
            error.toString().includes("Error"),
          "Should fail with account already in use error"
        );
      }
      // Ensure that the second initialization actually failed
      assert.strictEqual(
        flag,
        "Failed",
        "Initializing vault twice should fail"
      );
    });
  });

  describe("Deposit", () => {
    it("First deposit starts the game", async () => {
      await airdrop(provider.connection, alice.publicKey);

      const depositAmount = 1_000_000_000;

      // Record balances before deposit
      const poolBalanceBefore = await provider.connection.getBalance(poolPDA);
      const aliceBalanceBefore = await provider.connection.getBalance(
        alice.publicKey
      );

      // Record current block time
      const clock = await provider.connection.getBlockTime(
        await provider.connection.getSlot()
      );
      if (!clock) throw new Error("Failed to fetch block time");
      const now = clock;

      // Execute deposit instruction
      const txSig = await program.methods
        .depositSol(new anchor.BN(depositAmount))
        .accounts({
          depositor: alice.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([alice])
        .rpc();

      // Record balances after deposit
      const poolBalanceAfter = await provider.connection.getBalance(poolPDA);
      const aliceBalanceAfter = await provider.connection.getBalance(
        alice.publicKey
      );

      // Assert that pool balance increased by deposit amount
      assert.strictEqual(
        poolBalanceAfter,
        poolBalanceBefore + depositAmount,
        "Pool balance should increase by deposit amount"
      );

      // Assert that depositor's balance decreased
      assert.isTrue(
        aliceBalanceAfter < aliceBalanceBefore,
        "Depositor's balance should decrease after deposit"
      );

      // Fetch pool account and check updates
      const poolAccount = await program.account.pool.fetch(poolPDA);
      assert.strictEqual(
        poolAccount.lastDepositor.toString(),
        alice.publicKey.toString(),
        "Last depositor should be Alice"
      );
      assert.strictEqual(
        poolAccount.lastDepositAmount.toString(),
        depositAmount.toString(),
        "Last deposit amount should match deposit"
      );
      assert.isTrue(
        poolAccount.gameActive,
        "Game should be marked active after first deposit"
      );

      // End timestamp checks
      assert.isAbove(
        poolAccount.endTimestamp.toNumber(),
        now,
        "End timestamp should be in the future"
      );

      const expectedEndTime = now + 10;
      assert.approximately(
        poolAccount.endTimestamp.toNumber(),
        expectedEndTime,
        5, // allow ±5 sec drift
        "End timestamp should be ~24 hours from now"
      );
    });

    it("New deposit extends timer", async () => {
      await airdrop(provider.connection, alice.publicKey);
      await airdrop(provider.connection, bob.publicKey);

      const depositAmount1 = 2_000_000_000; // Alice's deposit
      const depositAmount2 = 3_000_000_000; // Bob's deposit (greater)

      // First deposit (Alice)
      await program.methods
        .depositSol(new anchor.BN(depositAmount1))
        .accounts({
          depositor: alice.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([alice])
        .rpc({ commitment: "confirmed" });

      const poolAfterAlice = await program.account.pool.fetch(poolPDA);
      const firstEndTime = poolAfterAlice.endTimestamp.toNumber();

      // Sleep to simulate time passing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Record current on-chain time before Bob’s deposit
      const clock = await provider.connection.getBlockTime(
        await provider.connection.getSlot()
      );
      if (!clock) throw new Error("Failed to fetch block time");
      const now = clock;

      // Second deposit (Bob)
      await program.methods
        .depositSol(new anchor.BN(depositAmount2))
        .accounts({
          depositor: bob.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([bob])
        .rpc({ commitment: "confirmed" });

      const poolAfterBob = await program.account.pool.fetch(poolPDA);

      // Assertions
      assert.strictEqual(
        poolAfterBob.lastDepositor.toString(),
        bob.publicKey.toString(),
        "Last depositor should be Bob"
      );

      assert.strictEqual(
        poolAfterBob.lastDepositAmount.toNumber(),
        depositAmount2,
        "Last deposit amount should be Bob's amount"
      );

      assert.isAbove(
        poolAfterBob.endTimestamp.toNumber(),
        firstEndTime,
        "End timestamp should be updated (later than Alice's)"
      );

      const expectedEndTime = now + 10;
      assert.approximately(
        poolAfterBob.endTimestamp.toNumber(),
        expectedEndTime,
        5, // allow ±5 sec drift
        "New end timestamp should be ~24 hours from Bob's deposit"
      );
    });

    it("Fails if new deposit is not greater than last", async () => {
      const depositAmount1 = 4_000_000_000; // Alice
      const depositAmount2 = 3_000_000_000; // Bob ≤ Alice

      // First deposit (valid)
      await program.methods
        .depositSol(new anchor.BN(depositAmount1))
        .accounts({
          depositor: alice.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([alice])
        .rpc();

      // Second deposit (should fail)
      try {
        await program.methods
          .depositSol(new anchor.BN(depositAmount2))
          .accounts({
            depositor: bob.publicKey,
            authority: poolAuthority.publicKey,
            pool: poolPDA,
          })
          .signers([bob])
          .rpc();

        // If we reach here, test should fail
        assert.fail("Expected InvalidAmount error but tx succeeded");
      } catch (err: any) {
        // Anchor error structure
        const anchorErr = anchor.AnchorError.parse(err.logs);
        assert.strictEqual(anchorErr.error.errorCode.number, 6001); // InvalidAmount
        assert.strictEqual(anchorErr.error.errorCode.code, "InvalidAmount");
      }
    });

    it("Fails if deposit amount is zero", async () => {
      try {
        await program.methods
          .depositSol(new anchor.BN(0))
          .accounts({
            depositor: alice.publicKey,
            authority: poolAuthority.publicKey,
            pool: poolPDA,
          })
          .signers([alice])
          .rpc();
        assert.fail("Expected InvalidAmount error but deposit succeeded");
      } catch (err: any) {
        const anchorErr = anchor.AnchorError.parse(err.logs);
        assert.strictEqual(anchorErr.error.errorCode.code, "InvalidAmount");
        assert.strictEqual(anchorErr.error.errorCode.number, 6001);
      }
    });
  });

  describe("Claim", () => {
    it("Winner can claim prize after game ends", async () => {
      // Step 1: Bob deposits into the pool
      await program.methods
        .depositSol(new anchor.BN(6_000_000_000))
        .accounts({
          depositor: bob.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([bob])
        .rpc();

      const poolAccountBefore = await program.account.pool.fetch(poolPDA);
      const endTs = poolAccountBefore.endTimestamp.toNumber();

      // Record Bob's balance before claiming
      const bobBalanceBefore = await provider.connection.getBalance(
        bob.publicKey
      );

      // Step 2: Warp time so game is finished (endTimestamp passed)
      // Anchor test validator doesn't expose warp directly, so simulate by producing blocks until blockTime > endTimestamp
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }) // dummy
        ),
        [],
        { commitment: "confirmed" }
      );

      let slot = await provider.connection.getSlot();
      let blockTime = (await provider.connection.getBlockTime(slot)) ?? 0;
      while (blockTime <= endTs) {
        slot = await provider.connection.getSlot("processed");
        blockTime = (await provider.connection.getBlockTime(slot)) ?? 0;
      }

      // Step 3: Claim prize
      await program.methods
        .claim()
        .accounts({
          claimer: bob.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([bob])
        .rpc({ commitment: "confirmed" });

      // Assert pool is drained
      const poolBalance = await provider.connection.getBalance(poolPDA);
      assert.equal(poolBalance, 0, "Pool should be drained before closing");

      // Assert Bob's balance increased
      const bobBalanceAfter = await provider.connection.getBalance(
        bob.publicKey
      );
      assert.ok(
        bobBalanceAfter > bobBalanceBefore,
        "Bob should receive lamports after claim"
      );

      // Assert pool account is closed after claim
      let poolClosed = false;
      try {
        await program.account.pool.fetch(poolPDA);
      } catch (err) {
        poolClosed = true;
      }
      assert.ok(poolClosed, "Pool account should be closed after claim");
    });

    it("Should fail if game has not ended yet", async () => {
      await airdrop(provider.connection, poolAuthority.publicKey);
      await airdrop(provider.connection, alice.publicKey);

      // Step 1: Initialize Pool
      await program.methods
        .initPool(new anchor.BN(5))
        .accounts({
          authority: poolAuthority.publicKey,
        })
        .signers([poolAuthority])
        .rpc();

      // Step 2: Alice deposits
      await program.methods
        .depositSol(new anchor.BN(1_000_000_000))
        .accounts({
          depositor: alice.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([alice])
        .rpc();

      // Step 3: Try to claim BEFORE endTimestamp
      try {
        await program.methods
          .claim()
          .accounts({
            claimer: alice.publicKey,
            authority: poolAuthority.publicKey,
            pool: poolPDA,
          })
          .signers([alice])
          .rpc();
        assert.fail("Claim should not succeed before game ends");
      } catch (err: any) {
        // Parse Anchor error
        const anchorErr = anchor.AnchorError.parse(err.logs);

        // Assert error code
        assert.strictEqual(anchorErr.error.errorCode.code, "GameNotEnded");
        assert.strictEqual(
          anchorErr.error.errorMessage,
          "The game is still active"
        );
      }
    });

    it("Should fail if a non-winner tries to claim", async () => {
      await airdrop(provider.connection, alice.publicKey);
      await airdrop(provider.connection, bob.publicKey);

      // Step 1: Alice deposits
      await program.methods
        .depositSol(new anchor.BN(2_000_000_000))
        .accounts({
          depositor: alice.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([alice])
        .rpc();

      // Step 2: Bob deposits higher amount (extends timer)
      await program.methods
        .depositSol(new anchor.BN(3_000_000_000))
        .accounts({
          depositor: bob.publicKey,
          authority: poolAuthority.publicKey,
          pool: poolPDA,
        })
        .signers([bob])
        .rpc();

      // Step 3: Warp time past endTimestamp
      const poolAccount = await program.account.pool.fetch(poolPDA);
      const endTs = poolAccount.endTimestamp.toNumber();

      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          })
        ),
        [],
        { commitment: "confirmed" }
      );

      let slot = await provider.connection.getSlot();
      let blockTime = (await provider.connection.getBlockTime(slot)) ?? 0;
      while (blockTime <= endTs) {
        slot = await provider.connection.getSlot("processed");
        blockTime = (await provider.connection.getBlockTime(slot)) ?? 0;
      }

      // Step 4: Alice (non-winner) tries to claim
      try {
        await program.methods
          .claim()
          .accounts({
            claimer: alice.publicKey,
            authority: poolAuthority.publicKey,
            pool: poolPDA,
          })
          .signers([alice])
          .rpc();

        assert.fail("Non-winner was able to claim prize");
      } catch (err: any) {
        // Parse Anchor error from logs
        const anchorErr = anchor.AnchorError.parse(err.logs);

        // Assert error code and message
        assert.strictEqual(anchorErr.error.errorCode.code, "InvalidWinner");
        assert.strictEqual(
          anchorErr.error.errorMessage,
          "The specified winner is not valid"
        );
      }
    });
  });
});

async function airdrop(
  connection: any,
  address: any,
  amount = 100 * anchor.web3.LAMPORTS_PER_SOL
) {
  await connection.confirmTransaction(
    await connection.requestAirdrop(address, amount),
    "confirmed"
  );
}
