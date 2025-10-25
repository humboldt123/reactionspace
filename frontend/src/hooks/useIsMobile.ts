import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768; // pixels

function isMobileDevice(): boolean {
  // Check if it's actually a mobile/tablet device, not just a narrow window
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  // Also check for touch support (mobile devices have touch)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Only consider it mobile if:
  // 1. It has a mobile user agent, OR
  // 2. It has touch support AND the screen is narrow (to catch tablets in portrait)
  return isMobileUA || (hasTouch && window.innerWidth < MOBILE_BREAKPOINT);
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(isMobileDevice());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
