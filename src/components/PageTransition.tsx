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
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
