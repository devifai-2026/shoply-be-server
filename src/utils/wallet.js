const { getWalletModel } = require('../models/Wallet');

// Atomically credits a customer's wallet and appends a ledger entry in one
// update — used by both the admin refund-to-wallet flow and (later) reseller
// earnings, so there's a single place that ever mutates a wallet balance.
async function creditWallet(conn, { customerId, amount, reason, orderRef = null }) {
  if (!amount || amount <= 0) throw new Error('Credit amount must be positive');
  const Wallet = getWalletModel(conn);
  const wallet = await Wallet.findOneAndUpdate(
    { customer: customerId },
    {
      $inc: { balance: amount },
      $push: { transactions: { amount, type: 'credit', reason, orderRef } },
    },
    { upsert: true, new: true },
  );
  return wallet;
}

// Debits a customer's wallet — used at checkout when "Use Wallet Balance" is
// applied. Rejects if the wallet doesn't have enough balance, via an atomic
// conditional update (balance >= amount) rather than a read-then-write pair,
// so two concurrent checkouts can't both succeed against the same balance.
async function debitWallet(conn, { customerId, amount, reason, orderRef = null }) {
  if (!amount || amount <= 0) throw new Error('Debit amount must be positive');
  const Wallet = getWalletModel(conn);
  const wallet = await Wallet.findOneAndUpdate(
    { customer: customerId, balance: { $gte: amount } },
    {
      $inc: { balance: -amount },
      $push: { transactions: { amount, type: 'debit', reason, orderRef } },
    },
    { new: true },
  );
  if (!wallet) throw new Error('Insufficient wallet balance');
  return wallet;
}

module.exports = { creditWallet, debitWallet };
