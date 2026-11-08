'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// lucide's `atom`, redrawn in animate-ui's pattern (2026-11-08), as govblock's file-text was: the same paths, so it is
// pixel-identical at rest, with one motion for when an AnimateIcon ancestor plays it. The two orbits turn a quarter
// about the nucleus.

type AtomProps = IconProps<keyof typeof animations>;

const turn = (deg: number) => ({
  initial: { rotate: 0 },
  animate: { rotate: deg, transition: { duration: 0.5, ease: 'easeInOut' as const } },
});

const animations = {
  default: {
    nucleus: {},
    orbit1: turn(90),
    orbit2: turn(-90),
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: AtomProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path
        d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"
        style={{ transformOrigin: '12px 12px' }}
        variants={variants.orbit1}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"
        style={{ transformOrigin: '12px 12px' }}
        variants={variants.orbit2}
        initial="initial"
        animate={controls}
      />
      <motion.circle cx="12" cy="12" r="1" fill="currentColor" variants={variants.nucleus} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function Atom(props: AtomProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Atom, Atom as AtomIcon, type AtomProps, type AtomProps as AtomIconProps };
