export type AuthStatus = { authenticated: boolean; username?: string };
export type LoginResult = { success: boolean; username?: string; error?: string };

export async function fetchAuthStatus(): Promise<AuthStatus> {
    const res = await fetch("/api/auth/status", { credentials: "include" });
    return res.json();
}

export async function login(username: string, pin: string): Promise<LoginResult> {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
    });
    return res.json();
}

export async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
