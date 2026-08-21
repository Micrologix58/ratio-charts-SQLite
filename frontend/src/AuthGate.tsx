import React, { useEffect, useState } from "react";
import { fetchAuthStatus, login, logout } from "./services/authApi";

type Props = { children: React.ReactNode };

export function AuthGate({ children }: Props) {
    const [status, setStatus] = useState<"checking" | "authed" | "anon">("checking");
    const [authedUsername, setAuthedUsername] = useState<string | null>(null);

    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchAuthStatus()
            .then(res => {
                if (cancelled) return;
                setStatus(res.authenticated ? "authed" : "anon");
                setAuthedUsername(res.username ?? null);
            })
            .catch(() => { if (!cancelled) setStatus("anon"); });
        return () => { cancelled = true; };
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const res = await login(username.trim(), pin.trim());
            if (res.success) {
                setStatus("authed");
                setAuthedUsername(res.username ?? username.trim());
            } else {
                setError(res.error || "Invalid username or PIN");
            }
        } catch {
            setError("Login failed — check the server connection");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleLogout() {
        await logout();
        setStatus("anon");
        setAuthedUsername(null);
        setUsername("");
        setPin("");
    }

    if (status === "checking") {
        return <div style={{ flex: 1, padding: 24, color: "#94a3b8" }}>Checking session…</div>;
    }

    if (status === "anon") {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <form
                    onSubmit={handleSubmit}
                    style={{
                        background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8,
                        padding: 28, width: 280, display: "flex", flexDirection: "column", gap: 12,
                    }}
                >
                    <h3 style={{ color: "#e2e8f0", margin: 0, textAlign: "center" }}>Sign in</h3>
                    <input
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Username"
                        autoFocus
                        style={{ background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a", borderRadius: 4, padding: "8px 10px" }}
                    />
                    <input
                        value={pin}
                        onChange={e => setPin(e.target.value)}
                        placeholder="PIN"
                        type="password"
                        inputMode="numeric"
                        style={{ background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a", borderRadius: 4, padding: "8px 10px" }}
                    />
                    {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
                    <button
                        type="submit"
                        disabled={submitting || !username.trim() || !pin.trim()}
                        style={{
                            background: "#2d5bff", color: "#fff", border: "1px solid #2d5bff", borderRadius: 4,
                            padding: "8px 10px", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
                        }}
                    >
                        {submitting ? "Signing in…" : "Sign in"}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 10px 0" }}>
                <button
                    onClick={handleLogout}
                    style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                >
                    Log out{authedUsername ? ` (${authedUsername})` : ""}
                </button>
            </div>
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                {children}
            </div>
        </div>
    );
}
