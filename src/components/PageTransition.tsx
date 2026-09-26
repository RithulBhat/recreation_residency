import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Route transition wrapper. Pass `<Routes location={useLocation()}>` as children
 * so the exiting page keeps rendering its old route during the exit animation.
 * Only opacity + translate are animated: a lingering `filter`/`transform` would turn this wrapper
 * into the containing block for `position: fixed` children (bottom bars, overlays).
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const location = useLocation();
  const reduce = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
