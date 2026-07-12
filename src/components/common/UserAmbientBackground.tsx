import React from 'react';

interface Props {
    /**
     * Extra classes to blend the wrapper with the surrounding layout.
     */
    className?: string;
}

/**
 * Ambient background layer for user-facing routes.
 * Renders soft, slowly drifting orange + blue blobs on a white/slate base
 * that adapts to light / dark mode. Pointer-events disabled so it never
 * intercepts UI.
 */
export const UserAmbientBackground: React.FC<Props> = ({ className = '' }) => (
    <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white transition-colors duration-500 dark:bg-slate-950 ${className}`}
    >
        {/* Soft base wash */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(255,128,0,0.10),transparent_55%),radial-gradient(1100px_circle_at_85%_15%,rgba(0,144,255,0.10),transparent_60%),radial-gradient(1000px_circle_at_50%_100%,rgba(56,189,248,0.08),transparent_60%)] dark:bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(255,128,0,0.14),transparent_55%),radial-gradient(1100px_circle_at_85%_15%,rgba(0,144,255,0.16),transparent_60%),radial-gradient(1000px_circle_at_50%_100%,rgba(56,189,248,0.10),transparent_60%)]" />

        {/* Drifting orange blob */}
        <div className="absolute -left-32 top-[8%] h-[540px] w-[540px] rounded-full bg-orange-300/40 blur-[110px] animate-drift-slow will-change-transform dark:bg-orange-500/25" />

        {/* Drifting blue blob */}
        <div className="absolute -right-40 top-[30%] h-[560px] w-[560px] rounded-full bg-sky-400/35 blur-[120px] animate-drift-slower will-change-transform dark:bg-sky-500/25" />

        {/* Accent cyan blob bottom */}
        <div className="absolute left-1/3 -bottom-32 h-[420px] w-[420px] rounded-full bg-cyan-300/25 blur-[110px] animate-drift-slow will-change-transform dark:bg-cyan-500/15" />

        {/* Very subtle grain / fine noise via layered radial gradients (no external asset) */}
        <div className="absolute inset-0 opacity-[0.12] mix-blend-overlay dark:opacity-[0.08] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.35)_1px,transparent_0)] bg-[length:22px_22px]" />
    </div>
);

export default UserAmbientBackground;
