import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { BookOpen, Keyboard, LogOut, Puzzle, Settings2, User } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { AuthModal } from "@/components/layout/auth-modal";
import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { getCurrentUser, logout, fetchProfile } from "@/services/auth";
import type { AuthUser } from "@/services/auth";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;

    // 商用改造：用户认证状态
    const [currentUser, setCurrentUser] = useState<AuthUser | null>(getCurrentUser());
    const [authOpen, setAuthOpen] = useState(false);

    useEffect(() => {
        if (currentUser) {
            fetchProfile().then(setCurrentUser).catch(() => {
                logout();
                setCurrentUser(null);
            });
        }
    }, []);

    const handleLogout = () => {
        logout();
        setCurrentUser(null);
    };

    const formatBalance = (balance: number) => {
        return `¥${(balance / 100).toFixed(2)}`;
    };

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {/* 商用改造：用户认证/余额 */}
            {currentUser ? (
                <>
                    <span className="text-xs font-medium text-stone-600 dark:text-stone-300" style={iconStyle}>
                        {formatBalance(currentUser.balance)}
                    </span>
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={handleLogout} aria-label="退出登录" title="退出登录">
                        <LogOut className="size-4" />
                    </button>
                </>
            ) : (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => setAuthOpen(true)} aria-label="登录" title="登录/注册">
                    <User className="size-4" />
                </button>
            )}
            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { setCurrentUser(getCurrentUser()); }} />
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label="节点插件" title="节点插件">
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a>
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            <VersionReleaseModal style={versionStyle} />
            <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
