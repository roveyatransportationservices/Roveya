"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "@/lib/client";
import { rs } from "@/lib/format";
import { Field, Modal, Spinner, useAction } from "./ui";

// Credit or debit a ROVEYA wallet. Each change becomes a ledger line with the reason.
export function WalletAdjust({ ownerId, name, balance, onDone }: { ownerId: string; name: string; balance: number; onDone: (balancePaise: number) => void }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { busy, run } = useAction();

  const save = async () => {
    const value = Number(amount) * (direction === "credit" ? 1 : -1);
    const result = await run("wallet", () => api<{ balancePaise: number }>(`/wallets/${ownerId}`, { body: { amount: value, note } }), direction === "credit" ? "Wallet credited." : "Wallet debited.");
    if (result) {
      onDone(result.balancePaise);
      setOpen(false);
      setAmount("");
      setNote("");
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Wallet size={14} className="text-gold" /> Adjust wallet
      </button>
      {open ? (
        <Modal title={`Adjust ${name}'s wallet`} onClose={() => setOpen(false)}>
          <p className="text-sm muted">Current balance {rs(balance)}</p>
          <div className="mt-4 flex gap-2">
            {(["credit", "debit"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setDirection(value)} className={`btn flex-1 ${direction === value ? (value === "credit" ? "border-success text-success" : "border-danger text-danger") : ""}`}>
                {value === "credit" ? "Add money" : "Take money"}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Amount (₹)">
              <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} placeholder="100" />
            </Field>
            <Field label="Reason" hint="Saved on the ledger line and in the audit log.">
              <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Goodwill credit for a late car" />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
            <button type="button" className="btn btn-gold" disabled={busy === "wallet" || !Number(amount) || note.trim().length < 4} onClick={() => void save()}>
              {busy === "wallet" ? <Spinner /> : null} {direction === "credit" ? "Credit" : "Debit"} {amount ? `₹${amount}` : ""}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
