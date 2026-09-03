'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// `reducedMotion="user"` hace que Motion respete `prefers-reduced-motion` en todo
// el subárbol sin que cada animación tenga que comprobarlo: desactiva las
// transformaciones y deja solo opacidad. Es la mitad de AC16; la otra mitad son las
// animaciones CSS, que globals.css apaga con su propia media query.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
