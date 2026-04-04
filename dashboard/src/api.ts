export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const REPO_URL =
  import.meta.env.VITE_REPO_URL ?? "https://github.com/nikhildd32/NeetPoker";

const ADMIN_TOKEN_STORAGE_KEY = "neetpoker_game_admin_token";

function getGameAdminToken(): string {
  if (typeof window === "undefined") return "";

  try {
    // 1. Check if the user is passing the token via URL (e.g. ?admin=SECRET)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("admin");
    
    if (urlToken) {
      // Save it securely to local storage
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, urlToken);
      
      // Clean up the URL so the secret doesn't stay visible in the address bar
      urlParams.delete("admin");
      const newSearch = urlParams.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState({}, "", newUrl);
      
      return urlToken.trim();
    }

    // 2. Otherwise read from local storage
    const stored = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    return stored?.trim() ?? "";
  } catch {
    return "";
  }
}

export function withGameAdminAuth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers ?? {});
  const token = getGameAdminToken();
  if (token) headers.set("X-Admin-Token", token);
  return { ...init, headers };
}
