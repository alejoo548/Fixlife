import { useEffect, useState } from 'react';

export function useResponsiveSheet(breakpoint = 768) {
    const [isDesktopSheet, setIsDesktopSheet] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= breakpoint;
    });

    useEffect(() => {
        const updateViewport = () => {
            setIsDesktopSheet(window.innerWidth >= breakpoint);
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);

        return () => {
            window.removeEventListener('resize', updateViewport);
        };
    }, [breakpoint]);

    return isDesktopSheet;
}
