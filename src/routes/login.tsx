import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-screen";

export const Route = createFileRoute("/login")({ component: AuthPage });
