import { handlers } from "@/auth";

// Auth.js のエンドポイント（/api/auth/signin, /callback/google, /signout など）。
// 実体は auth.ts が返す handlers で、ここはルートに割り当てるだけ。
export const { GET, POST } = handlers;
