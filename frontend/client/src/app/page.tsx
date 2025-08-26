"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast, Toaster } from "react-hot-toast";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import idl from "@/constant/solvarn.json";
import { PROGRAM_ID } from "@/constant";

// Types
interface Pool {
  publicKey: PublicKey;
  account: {
    authority: PublicKey;
    potAmount: number;
    lastDepositor: PublicKey;
    lastDepositAmount: number;
    endTimestamp: number;
    gameActive: boolean;
    bump: number;
    durationSeconds: number;
  };
}

// Wallet Configuration
const network = WalletAdapterNetwork.Devnet;
const endpoint = "https://api.devnet.solana.com";

const WalletAdapter = () => {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <MainApp />
          <Toaster
            position="top-center"
            reverseOrder={false}
            gutter={8}
            containerClassName=""
            containerStyle={{}}
            toastOptions={{
              // Define default options
              className: "",
              duration: 5000,
              removeDelay: 1000,
              style: {
                background: "#363636",
                color: "#fff",
              },

              // Default options for specific types
              success: {
                duration: 3000,
                iconTheme: {
                  primary: "green",
                  secondary: "black",
                },
              },
            }}
          />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const MainApp = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  // State
  const [pools, setPools] = useState<Pool[]>([]);
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState<
    "seconds" | "minutes" | "hours"
  >("minutes");
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Program setup
  const program = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;

    try {
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          signAllTransactions,
        },
        AnchorProvider.defaultOptions()
      );

      return new Program(idl as Idl, provider);
    } catch (error) {
      console.error("Program setup error:", error);
      return null;
    }
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  // Helper function to derive pool PDA
  const getPoolPDA = (authority: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), authority.toBuffer()],
      PROGRAM_ID
    );
  };

  // Real-time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto-refresh pool data every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (publicKey) {
        fetchPools();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [publicKey]);

  // Initial pool fetch
  useEffect(() => {
    if (publicKey) {
      fetchPools();
    }
  }, [publicKey]);

  // Fetch pools from program
  const fetchPools = async () => {
    if (!program) return;

    try {
      // Fetch all pool accounts
      const poolAccounts = await program.account.pool.all();

      if (!poolAccounts || poolAccounts.length === 0) {
        setPools([]); // CHANGED: Just set empty state, no error toast
        return;
      }

      const formattedPools: Pool[] = poolAccounts.map((poolAccount) => ({
        publicKey: poolAccount.publicKey,
        account: {
          authority: poolAccount.account.authority,
          potAmount: poolAccount.account.potAmount.toNumber(),
          lastDepositor: poolAccount.account.lastDepositor,
          lastDepositAmount: poolAccount.account.lastDepositAmount.toNumber(),
          endTimestamp: poolAccount.account.endTimestamp.toNumber() * 1000, // Convert to milliseconds
          gameActive: poolAccount.account.gameActive,
          bump: poolAccount.account.bump,
          durationSeconds: poolAccount.account.durationSeconds.toNumber(),
        },
      }));

      setPools(formattedPools);
    } catch (error: any) {
      // CHANGED: Ignore "not found" errors instead of showing toast
      if (
        error.message?.includes("Account does not exist") ||
        error.message?.includes("not found")
      ) {
        setPools([]); // CHANGED: Set empty pools silently
      } else {
        console.error("Fetch pools error:", error);
        toast.error("Failed to fetch pools");
      }
    }
  };

  // Format time remaining
  const formatTimeRemaining = (pool: Pool) => {
    if (!pool.account.gameActive) return "Not Started";

    const endTime = pool.account.endTimestamp;
    const remaining = Math.max(0, endTime - currentTime);

    if (remaining === 0) return "Ended";

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Check if pool has ended
  const isPoolEnded = (pool: Pool) => {
    if (!pool.account.gameActive) return false;
    const endTime = pool.account.endTimestamp;
    return currentTime >= endTime;
  };

  // Format SOL amount
  const formatSOL = (lamports: number) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
  };

  // Truncate public key
  const truncateKey = (key: string) => {
    return `${key.slice(0, 3)}...${key.slice(-3)}`;
  };

  // Create Pool
  const createPool = async () => {
    if (!program || !publicKey) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!duration || parseFloat(duration) <= 0) {
      toast.error("Please enter a valid duration");
      return;
    }

    setLoading({ ...loading, create: true });

    try {
      let durationInSeconds = parseFloat(duration);
      if (durationUnit === "minutes") durationInSeconds *= 60;
      if (durationUnit === "hours") durationInSeconds *= 3600;

      // Get pool PDA
      const [poolPDA] = getPoolPDA(publicKey);
      console.log(poolPDA);

      // Call init_pool instruction
      const txSig = await program.methods
        .initPool(new BN(durationInSeconds))
        .accounts({
          authority: publicKey,
          pool: poolPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Refresh pools after creation
      await fetchPools();
      setDuration("");

      toast.success(
        (t) => (
          <span>
            Pool created!{" "}
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-400"
            >
              View on Explorer
            </a>
          </span>
        ),
        { duration: 8000 }
      );
    } catch (error) {
      console.error("Create pool error:", error);
      toast.error("Failed to create pool");
    } finally {
      setLoading({ ...loading, create: false });
    }
  };

  // Deposit SOL
  const deposit = async () => {
    if (!program || !publicKey || !selectedPool) {
      toast.error("Please connect your wallet and select a pool");
      return;
    }

    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }

    const pool = pools.find((p) => p.publicKey.toString() === selectedPool);
    if (!pool) {
      toast.error("Pool not found");
      return;
    }

    if (isPoolEnded(pool)) {
      toast.error("Pool has ended");
      return;
    }

    setLoading({ ...loading, [selectedPool]: true });

    try {
      const lamports = parseFloat(depositAmount) * LAMPORTS_PER_SOL;

      const selectedPoolData = pools.find(
        (p) => p.publicKey.toString() === selectedPool
      );
      if (!selectedPoolData) {
        toast.error("Pool not found");
        return;
      }

      // Call deposit_sol instruction
      const txSig = await program.methods
        .depositSol(new BN(lamports))
        .accounts({
          depositor: publicKey,
          authority: selectedPoolData.account.authority,
          pool: selectedPoolData.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Refresh pools after deposit
      await fetchPools();
      setDepositAmount("");
      setSelectedPool(null);

      toast.success(
        (t) => (
          <span>
            Deposited {depositAmount} SOL!{" "}
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-400"
            >
              View on Explorer
            </a>
          </span>
        ),
        { duration: 8000 }
      );
    } catch (error) {
      console.error("Deposit error:", error);
      toast.error("Failed to deposit SOL");
    } finally {
      setLoading({ ...loading, [selectedPool]: false });
    }
  };

  // Claim Prize
  const claimPrize = async (poolKey: PublicKey) => {
    if (!program || !publicKey) {
      toast.error("Please connect your wallet");
      return;
    }

    const pool = pools.find(
      (p) => p.publicKey.toString() === poolKey.toString()
    );
    if (!pool) {
      toast.error("Pool not found");
      return;
    }

    if (!pool.account.lastDepositor.equals(publicKey)) {
      toast.error("Only the last depositor can claim the prize");
      return;
    }

    if (!isPoolEnded(pool)) {
      toast.error("Pool has not ended yet");
      return;
    }

    setLoading({ ...loading, [`claim_${poolKey.toString()}`]: true });

    try {
      // Call claim instruction
      const txSig = await program.methods
        .claim()
        .accounts({
          claimer: publicKey,
          authority: pool.account.authority,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Refresh pools after claim
      await fetchPools();
      toast.success(
        (t) => (
          <span>
            Prize claimed!{" "}
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-400"
            >
              View on Explorer
            </a>
          </span>
        ),
        { duration: 8000 }
      );
    } catch (error) {
      console.error("Claim prize error:", error);
      toast.error("Failed to claim prize");
    } finally {
      setLoading({ ...loading, [`claim_${poolKey.toString()}`]: false });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">Solvarn</h1>
            <WalletMultiButton className="!bg-white !text-black hover:!bg-gray-200 !rounded-lg !font-medium" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create Pool Section */}
        <section className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">Create New Pool</h2>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Enter duration..."
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-white focus:border-transparent"
              />
            </div>

            <div>
              <select
                value={durationUnit}
                onChange={(e) =>
                  setDurationUnit(
                    e.target.value as "seconds" | "minutes" | "hours"
                  )
                }
                className="px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-white focus:border-transparent"
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>

            <button
              onClick={createPool}
              disabled={loading.create || !publicKey}
              className="px-6 py-3 bg-white text-black hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              {loading.create ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mx-auto"></div>
              ) : (
                "Create Pool"
              )}
            </button>
          </div>
        </section>

        {/* Active Pools */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-6">Active Pools</h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pools.map((pool) => {
              const isEnded = isPoolEnded(pool);
              const isLastDepositor =
                publicKey && pool.account.lastDepositor.equals(publicKey);
              const canClaim =
                isEnded && isLastDepositor && pool.account.potAmount > 0;

              return (
                <div
                  key={pool.publicKey.toString()}
                  className={`bg-gray-900 rounded-lg p-6 border ${
                    isEnded ? "border-red-500" : "border-gray-700"
                  } hover:border-gray-600 transition-colors`}
                >
                  <div className="space-y-4">
                    {/* Pool Info */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-300">
                          Pool ID
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            isEnded
                              ? "bg-red-900 text-red-300"
                              : "bg-green-900 text-green-300"
                          }`}
                        >
                          {isEnded ? "Ended" : "Active"}
                        </span>
                      </div>
                      <p className="text-sm font-mono text-gray-400">
                        {truncateKey(pool.publicKey.toString())}
                      </p>
                    </div>

                    {/* Prize Pool */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Prize Pool</span>
                      <span className="text-lg font-bold text-white">
                        {formatSOL(pool.account.potAmount)} SOL
                      </span>
                    </div>

                    {/* Timer */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">
                        Time Remaining
                      </span>
                      <span
                        className={`font-mono font-medium ${
                          isEnded ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        {formatTimeRemaining(pool)}
                      </span>
                    </div>

                    {/* Last Depositor */}
                    <div>
                      <span className="text-sm text-gray-300">
                        Last Depositor
                      </span>
                      <p className="text-sm font-mono text-gray-400 flex items-center space-x-1">
                        <span>
                          {truncateKey(pool.account.lastDepositor.toString())}
                        </span>
                        {isLastDepositor && (
                          <span className="text-green-400 text-xs">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-300 mt-1">
                        Last Deposit:{" "}
                        {formatSOL(pool.account.lastDepositAmount)} SOL
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                      {!isEnded && pool.account.gameActive ? (
                        <button
                          onClick={() =>
                            setSelectedPool(pool.publicKey.toString())
                          }
                          disabled={!publicKey}
                          className="w-full px-4 py-2 bg-white text-black hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                        >
                          Deposit SOL
                        </button>
                      ) : (
                        canClaim && (
                          <button
                            onClick={() => claimPrize(pool.publicKey)}
                            disabled={
                              loading[`claim_${pool.publicKey.toString()}`]
                            }
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                          >
                            {loading[`claim_${pool.publicKey.toString()}`] ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
                            ) : (
                              "Claim Prize"
                            )}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pools.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">
                No pools available. Create the first one!
              </p>
            </div>
          )}
        </section>

        {/* Deposit Modal */}
        {selectedPool && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4">Deposit SOL</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount (SOL)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter SOL amount..."
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-white focus:border-transparent"
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setSelectedPool(null)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deposit}
                    disabled={loading[selectedPool] || !depositAmount}
                    className="flex-1 px-4 py-2 bg-white text-black hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                  >
                    {loading[selectedPool] ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mx-auto"></div>
                    ) : (
                      "Deposit"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4">How It Works</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                1
              </div>
              <p>
                <strong>Create Pool:</strong> Set a duration for your pool
                (seconds, minutes, or hours)
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                2
              </div>
              <p>
                <strong>Deposit SOL:</strong> Players can deposit SOL into
                active pools. The countdown starts with the first deposit
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                3
              </div>
              <p>
                <strong>Win Prize:</strong> The last depositor when time expires
                wins the entire pool!
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default function Home() {
  return <WalletAdapter />;
}
