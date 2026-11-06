import type { ReactNode } from "react";
import { Typed } from "./guide.js";

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="how-section">
      <span className="meta">{n}</span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

const Tx = ({ h }: { h: string }) => <span className="mono small">{h.slice(0, 10)}…{h.slice(-4)}</span>;

export function HowPage() {
  return (
    <>
      <Typed as="h1" text="How Lifeboat works" />
      <p className="lede">The short version first, then the details for developers.</p>

      <section className="card" style={{ maxWidth: 820, marginBottom: 48 }}>
        <h2>The short version</h2>
        <ol className="short-version t2">
          <li>
            <b>The risk.</b> Every Ethereum account that has sent a transaction has revealed its public key. A future quantum
            computer could turn that into the private key and empty the account.
          </li>
          <li>
            <b>The fix.</b> Hash-based signatures are believed to be safe from quantum computers. Lifeboat gives you an account
            that checks one of those on every transaction, using 1,024 single-use keys made on your own device.
          </li>
          <li>
            <b>The move.</b> One transaction creates that account and moves all your coins and tokens into it. A sponsor pays
            the fee, so even an account with no spare ETH can escape.
          </li>
          <li>
            <b>The switch.</b> At first the account needs both your old key and a quantum-safe signature. When the threat is
            real, you turn the old key off and only the quantum-safe keys count.
          </li>
          <li>
            <b>Why now, and why a test network.</b> This needs a new kind of Ethereum transaction (EIP-8141) and a new mempool
            (ERC-8421) that lets the sponsor check the move. Both run on a test network today. Lifeboat shows the whole path
            working there.
          </li>
        </ol>
      </section>

      <h2 style={{ marginBottom: 8 }}>The details</h2>

      <div className="how-list">
        <Section n="01" title="The problem">
          <p className="t2">
            An Ethereum account publishes its secp256k1 public key the first time it signs. A large enough quantum computer
            turns that public key back into the private key. Ethereum plans to move accounts to post-quantum signatures through
            account abstraction (EIP-8141), with no flag day, but nothing yet takes an existing account there.
          </p>
        </Section>

        <Section n="02" title="The signature: XMSS with WOTS+C">
          <p className="t2">
            Only keccak256, the most conservative post-quantum assumption. Each account holds a Merkle tree of 1,024 one-time
            keys. The signer tries counters until the message's 128 base-4 digits sum to exactly 240, so no checksum is needed
            and verifying always walks exactly 144 hash steps.
          </p>
          <dl className="facts small">
            <dt>Verification</dt>
            <dd>48,600 gas, fixed (an earlier w = 16 version averaged 101k and didn't fit)</dd>
            <dt>Signature</dt>
            <dd>4,424 bytes</dd>
            <dt>Key tree</dt>
            <dd>2^10 keys, ~5 s to make in a browser worker</dd>
            <dt>Signing</dt>
            <dd>~0.3 s, including the counter search</dd>
          </dl>
        </Section>

        <Section n="03" title="The account">
          <p className="t2">
            A frame-transaction account checks the quantum-safe signature in its VERIFY frame. A one-time key must never sign
            twice, so the account only accepts the key matching the transaction's nonce, and the signer keeps a journal that
            refuses a second message for a used key.
          </p>
          <dl className="facts small">
            <dt>Hybrid</dt>
            <dd>needs the owner's ECDSA signature and the quantum-safe one</dd>
            <dt>Quantum-safe only</dt>
            <dd>a one-way switch, itself signed with a quantum-safe key</dd>
            <dt>Rotation</dt>
            <dd>moves to a fresh tree before the 1,024 keys run out</dd>
          </dl>
        </Section>

        <Section n="04" title="Why it needs the alt mempool">
          <p className="t2">
            The account fits the public mempool's 100,000-gas validation budget: its transactions were mined through it.
            The migration sponsor does not fit its rules.
            To pay for a stranger's migration safely, it checks during validation that every asset goes into a genuine Lifeboat
            account, which means reading the factory's registry. Reading another contract's storage is allowed only for a
            staked entity, in the ERC-8421 alt mempool. The same signed migration, sent both ways:
          </p>
          <dl className="facts small">
            <dt>Public mempool</dt>
            <dd>rejected: StorageReadNonSender</dd>
            <dt>Alt mempool</dt>
            <dd>
              admitted and mined, <Tx h="0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150" />
            </dd>
            <dt>Sponsor's rules</dt>
            <dd>key exposed · genuine Lifeboat · once per account · capped gas</dd>
          </dl>
        </Section>

        <Section n="05" title="Privacy and control">
          <p className="t2">
            The exposure check sends all five reads through Anon-RPC over Tor (or the Nym mixnet when Tor's gateway is down), with the checked address as the isolation key,
            so the RPC provider sees an exit node and can't link one check to the next. Keys, the seed and the journal stay
            in this browser. Nothing depends on a server of ours: anyone can deploy their own factory and sponsor, and an
            account with ETH can pay for its own move.
          </p>
        </Section>

        <Section n="06" title="What came before">
          <dl className="facts small">
            <dt>sm-stack/eip8141-poc</dt>
            <dd>a SPHINCS⁻ frame account, on a modified toolchain, with no migration</dd>
            <dt>ZKnox, FlyFlow</dt>
            <dd>Falcon verifiers and ERC-4337 accounts, not frame transactions</dd>
            <dt>StablePQC, Quantus</dt>
            <dd>exposure checkers that stop at the warning</dd>
            <dt>Lifeboat</dt>
            <dd>the path from an exposed account into a quantum-safe frame account, in one sponsored transaction</dd>
          </dl>
        </Section>

        <Section n="07" title="Limits">
          <p className="t2" style={{ marginBottom: 0 }}>
            Unaudited, experimental cryptography, on a devnet that can be reset. XMSS is stateful: losing the journal and
            signing a different transaction with a used key weakens that key. Creating an account costs the sponsor about
            7.7M state gas on this devnet. The Tor route relies on a demo gateway, so the check falls back to the Nym mixnet when it's down.{" "}
            <a href="https://github.com/ramavats/lifeboat">The code, tests and transaction log are on GitHub.</a>
          </p>
        </Section>
      </div>
    </>
  );
}
